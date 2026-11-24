import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  type GenerativeModel,
  type HybridParams,
  type Part,
  type Tool,
} from 'firebase/ai';
import { ai, isFirebaseConfigured, setLastFirebaseError } from '../firebase';
import { VERIFIED_ROUTES, type VerifiedRouteKey } from '../data/verifiedRoutes';
import type {
  ExtractedBooking,
  FlightLookupResult,
  NanoStatus,
  Price,
  ReplanOutput,
  RouteOption,
  TripPlan,
} from '../types';
import { validateModelAnswer } from './validate';

const CLOUD_MODEL_ID = 'gemini-2.5-flash';
const ON_DEVICE_TIMEOUT_MS = 25_000;
const CLOUD_TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 8_000;

export const REPLAN_SYSTEM_INSTRUCTION =
  'You are Porter, a calm airport-to-hotel helper. Use ONLY the JSON plan given. Never invent prices, times, platform numbers or phone numbers. If something is missing, put it in unknowns. Each step is under 15 words, max 6 steps. Plain English, no emojis. Return JSON only.';

export interface PlanContext {
  flight: {
    number: string | null;
    landingLocalISO: string | null;
  };
  airport: {
    name: string | null;
    iata: string | null;
  };
  hotel: {
    name: string | null;
    address: string | null;
    phone: string | null;
    entranceNote: string | null;
    receptionNote: string | null;
    lateArrivalPolicy: string | null;
    cancellationPolicy: string | null;
  };
  verifiedRoute: boolean;
  pickedRouteId?: string | null;
  scenario?: 'train_cancelled';
  event?: string;
  options: RouteOption[];
}

export interface FirebaseQuestionResult {
  answer: ReplanOutput;
  routeId?: string;
  engine: 'nano' | 'cloud';
  cloudFallbackUsed: boolean;
}

export interface HybridModelOptions {
  mode?: InferenceMode;
  systemInstruction?: string;
  responseSchema?: Schema;
  responseMimeType?: string;
  tools?: Tool[];
}

const REPLAN_RESPONSE_SCHEMA = Schema.object({
  properties: {
    recommendation: Schema.string(),
    reason: Schema.string(),
    steps: Schema.array({ items: Schema.string(), maxItems: 6 }),
    fallback: Schema.string(),
    unknowns: Schema.array({ items: Schema.string() }),
    routeId: Schema.string({ nullable: true }),
  },
  optionalProperties: ['routeId'],
});

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out.`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function cleanNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'not found') {
    return null;
  }
  return trimmed;
}

export function isLikelyTouchPhone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const smallViewport = window.innerWidth <= 900;
  return (coarsePointer || noHover) && smallViewport;
}

export function buildPlanContext(
  plan: TripPlan,
  pickedRouteId?: string | null,
  trainCancelled?: boolean,
  event?: string
): PlanContext {
  const options = trainCancelled
    ? plan.options.filter((o) => o.mode !== 'public')
    : plan.options;
  return {
    flight: {
      number: plan.flight.number,
      landingLocalISO: plan.flight.landingLocalISO,
    },
    airport: {
      name: plan.airport.name,
      iata: plan.airport.iata,
    },
    hotel: {
      name: plan.hotel.name,
      address: plan.hotel.address,
      phone: plan.hotel.phone,
      entranceNote: plan.hotel.entranceNote,
      receptionNote: plan.hotel.receptionNote,
      lateArrivalPolicy: plan.hotel.lateArrivalPolicy,
      cancellationPolicy: plan.hotel.cancellationPolicy,
    },
    verifiedRoute: plan.verifiedRoute,
    ...(pickedRouteId ? { pickedRouteId } : {}),
    ...(trainCancelled ? { scenario: 'train_cancelled' as const } : {}),
    ...(event ? { event } : {}),
    options,
  };
}

export function getHybridModel(options: HybridModelOptions = {}): GenerativeModel {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }

  const mode = options.mode ?? InferenceMode.PREFER_ON_DEVICE;
  const systemInstruction = options.systemInstruction;

  const hybridParams: HybridParams = {
    mode,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        ...(systemInstruction
          ? {
              initialPrompts: [
                {
                  role: 'system',
                  content: [{ type: 'text', value: systemInstruction }],
                },
              ],
            }
          : {}),
      },
    },
    inCloudParams: {
      model: CLOUD_MODEL_ID,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.responseMimeType || options.responseSchema
        ? {
            generationConfig: {
              ...(options.responseMimeType
                ? { responseMimeType: options.responseMimeType }
                : {}),
              ...(options.responseSchema
                ? { responseSchema: options.responseSchema }
                : {}),
            },
          }
        : {}),
    },
  };

  return getGenerativeModel(ai, hybridParams);
}

function stripEmoji(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
}

function validateAndBuildReplanOutput(
  rawText: string,
  planJson: string,
  question: string,
  plan: TripPlan,
  trainCancelled?: boolean
): { answer: ReplanOutput; routeId?: string } {
  const parsed = extractJsonObject(rawText);
  if (!parsed) {
    throw new Error('Invalid JSON response from Firebase AI.');
  }

  const rawRec = typeof parsed.recommendation === 'string' ? parsed.recommendation : '';
  const rawReason = typeof parsed.reason === 'string' ? parsed.reason : '';
  const rawFallback = typeof parsed.fallback === 'string' ? parsed.fallback : '';
  const rawSteps = Array.isArray(parsed.steps)
    ? parsed.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  const rawUnknowns = Array.isArray(parsed.unknowns)
    ? parsed.unknowns.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : [];

  if (!rawRec.trim()) {
    throw new Error('Missing recommendation from Firebase AI.');
  }

  const recommendation = stripEmoji(
    validateModelAnswer(rawRec, planJson, question).text
  );
  const reason = stripEmoji(
    validateModelAnswer(rawReason || 'Chosen from your saved trip plan.', planJson, question).text
  );
  const fallback = stripEmoji(
    validateModelAnswer(
      rawFallback || 'Ask at the staffed airport information desk or call your hotel.',
      planJson,
      question
    ).text
  );
  const steps = rawSteps.slice(0, 6).map((s) =>
    stripEmoji(validateModelAnswer(s, planJson, question).text)
  );
  const unknowns = rawUnknowns.map((u) =>
    stripEmoji(validateModelAnswer(u, planJson, question).text)
  );

  const routeId =
    typeof parsed.routeId === 'string' && parsed.routeId.trim()
      ? parsed.routeId.trim()
      : undefined;

  if (trainCancelled) {
    if (routeId) {
      const picked = plan.options.find((o) => o.id === routeId);
      if (picked && picked.mode === 'public') {
        throw new Error('Model recommended a cancelled train route.');
      }
    }
    const combined = `${recommendation} ${reason} ${steps.join(' ')}`;
    if (
      /\b(train is running|trains are running|rail is running|take the (?:airport )?(?:train|rail|elizabeth line|heathrow express|piccadilly|monorail|keikyu|airport rail link))\b/i.test(
        combined
      )
    ) {
      throw new Error('Model claimed cancelled train service is running.');
    }
  }

  return {
    answer: {
      recommendation,
      reason,
      steps,
      fallback,
      unknowns,
    },
    ...(routeId ? { routeId } : {}),
  };
}

export async function runQuestion(
  question: string,
  plan: TripPlan,
  event?: string,
  options?: {
    pickedRouteId?: string | null;
    trainCancelled?: boolean;
    mode?: InferenceMode;
  }
): Promise<FirebaseQuestionResult> {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const requestedMode = !isOnline
    ? InferenceMode.ONLY_ON_DEVICE
    : options?.mode ?? InferenceMode.PREFER_ON_DEVICE;

  const planContext = buildPlanContext(
    plan,
    options?.pickedRouteId,
    options?.trainCancelled,
    event
  );
  const planJson = JSON.stringify(planContext);

  const prompt = [
    REPLAN_SYSTEM_INSTRUCTION,
    'Return ONLY JSON matching {"recommendation": string, "reason": string, "steps": string[], "fallback": string, "unknowns": string[], "routeId": string|null}.',
    `Plan JSON:\n${planJson}`,
    event ? `Event: ${event}` : '',
    `Traveler question: ${question.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const invokeMode = async (mode: InferenceMode, timeoutMs: number) => {
    const model = getHybridModel({
      mode,
      systemInstruction: REPLAN_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: REPLAN_RESPONSE_SCHEMA,
    });
    const result = await withTimeout(
      model.generateContent(prompt),
      timeoutMs,
      mode === InferenceMode.ONLY_ON_DEVICE ? 'On-device model' : 'Cloud model'
    );
    const source = result.response.inferenceSource;
    const rawText = result.response.text();
    const validated = validateAndBuildReplanOutput(
      rawText,
      planJson,
      question,
      plan,
      options?.trainCancelled
    );
    return { source, validated };
  };

  try {
    if (requestedMode === InferenceMode.ONLY_ON_DEVICE) {
      const { validated } = await invokeMode(InferenceMode.ONLY_ON_DEVICE, ON_DEVICE_TIMEOUT_MS);
      setLastFirebaseError(null);
      return {
        answer: validated.answer,
        routeId: validated.routeId,
        engine: 'nano',
        cloudFallbackUsed: false,
      };
    }

    if (requestedMode === InferenceMode.ONLY_IN_CLOUD) {
      if (!isOnline) {
        throw new Error('Cloud AI requires an internet connection.');
      }
      const { validated } = await invokeMode(InferenceMode.ONLY_IN_CLOUD, CLOUD_TIMEOUT_MS);
      setLastFirebaseError(null);
      return {
        answer: validated.answer,
        routeId: validated.routeId,
        engine: 'cloud',
        cloudFallbackUsed: false,
      };
    }

    // Online PREFER_ON_DEVICE hybrid inference
    const { source, validated } = await invokeMode(
      InferenceMode.PREFER_ON_DEVICE,
      ON_DEVICE_TIMEOUT_MS
    );

    if (source === InferenceSource.ON_DEVICE) {
      setLastFirebaseError(null);
      return {
        answer: validated.answer,
        routeId: validated.routeId,
        engine: 'nano',
        cloudFallbackUsed: false,
      };
    }

    if (source === InferenceSource.IN_CLOUD) {
      setLastFirebaseError(null);
      return {
        answer: validated.answer,
        routeId: validated.routeId,
        engine: 'cloud',
        cloudFallbackUsed: true,
      };
    }

    // Defensive explicit handoff if inferenceSource is absent
    try {
      const onDevice = await invokeMode(InferenceMode.ONLY_ON_DEVICE, ON_DEVICE_TIMEOUT_MS);
      setLastFirebaseError(null);
      return {
        answer: onDevice.validated.answer,
        routeId: onDevice.validated.routeId,
        engine: 'nano',
        cloudFallbackUsed: false,
      };
    } catch {
      const inCloud = await invokeMode(InferenceMode.ONLY_IN_CLOUD, CLOUD_TIMEOUT_MS);
      setLastFirebaseError(null);
      return {
        answer: inCloud.validated.answer,
        routeId: inCloud.validated.routeId,
        engine: 'cloud',
        cloudFallbackUsed: true,
      };
    }
  } catch (err) {
    setLastFirebaseError(err);
    throw err;
  }
}

export async function probeNanoAvailability(): Promise<NanoStatus> {
  if (!ai || !isFirebaseConfigured || isLikelyTouchPhone()) {
    return 'not ready';
  }
  try {
    const model = getHybridModel({
      mode: InferenceMode.ONLY_ON_DEVICE,
    });
    await withTimeout(model.generateContent('ok'), PROBE_TIMEOUT_MS, 'Nano probe');
    return 'ready';
  } catch {
    return 'not ready';
  }
}

export async function initializeNanoOnDevice(
  onProgress?: (progressValue: number) => void
): Promise<NanoStatus> {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }
  if (isLikelyTouchPhone()) {
    return 'not ready';
  }
  try {
    const model = getHybridModel({
      mode: InferenceMode.PREFER_ON_DEVICE,
    });
    await model.initializeDeviceModel((progressValue) => {
      if (typeof progressValue === 'number' && Number.isFinite(progressValue)) {
        onProgress?.(progressValue);
      }
    });
    const status = await probeNanoAvailability();
    if (status === 'ready') {
      setLastFirebaseError(null);
    }
    return status;
  } catch (err) {
    setLastFirebaseError(err);
    throw err;
  }
}

// Cloud-only tasks via Firebase AI Logic (InferenceMode.ONLY_IN_CLOUD)

export async function extractTripWithFirebase(params: {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}): Promise<ExtractedBooking> {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Connect once to set up your route. After that Porter works offline.');
  }

  const schema = Schema.object({
    properties: {
      flightNumber: Schema.string({ nullable: true }),
      flightDate: Schema.string({ nullable: true }),
      hotelName: Schema.string({ nullable: true }),
      hotelAddress: Schema.string({ nullable: true }),
      hotelPhone: Schema.string({ nullable: true }),
      lateArrivalPolicy: Schema.string({ nullable: true }),
      cancellationPolicy: Schema.string({ nullable: true }),
      receptionNote: Schema.string({ nullable: true }),
      entranceNote: Schema.string({ nullable: true }),
    },
  });

  const model = getHybridModel({
    mode: InferenceMode.ONLY_IN_CLOUD,
    systemInstruction:
      'Extract only what is literally present. If a field is missing return null. Never guess.',
    responseMimeType: 'application/json',
    responseSchema: schema,
  });

  const parts: Part[] = [];
  if (params.inlineData) {
    parts.push({
      type: 'inlineData',
      inlineData: {
        mimeType: params.inlineData.mimeType,
        data: params.inlineData.data,
      },
    });
  }

  const cleanText = params.text?.trim() ?? '';
  parts.push({
    type: 'text',
    text: cleanText
      ? `Extract any flight and hotel details literally present in this input:\n\n${cleanText}`
      : 'Extract any flight and hotel details literally present in this booking document.',
  });

  try {
    const result = await withTimeout(
      model.generateContent(parts),
      CLOUD_TIMEOUT_MS,
      'Trip extraction'
    );
    const parsed = extractJsonObject(result.response.text()) ?? {};
    setLastFirebaseError(null);
    return {
      flightNumber: cleanNullableString(parsed.flightNumber),
      flightDate: cleanNullableString(parsed.flightDate),
      hotelName: cleanNullableString(parsed.hotelName),
      hotelAddress: cleanNullableString(parsed.hotelAddress),
      hotelPhone: cleanNullableString(parsed.hotelPhone),
      lateArrivalPolicy: cleanNullableString(parsed.lateArrivalPolicy),
      cancellationPolicy: cleanNullableString(parsed.cancellationPolicy),
      receptionNote: cleanNullableString(parsed.receptionNote),
      entranceNote: cleanNullableString(parsed.entranceNote),
    };
  } catch (err) {
    setLastFirebaseError(err);
    throw new Error(
      'Porter could not read those details right now. Please check your connection and try again.'
    );
  }
}

export async function transcribeAudioWithFirebase(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Voice input needs a connection.');
  }

  const model = getHybridModel({
    mode: InferenceMode.ONLY_IN_CLOUD,
  });

  const parts: Part[] = [
    {
      type: 'inlineData',
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    },
    {
      type: 'text',
      text: 'Transcribe this spoken airport and hotel travel request accurately. Return only the spoken words.',
    },
  ];

  try {
    const result = await withTimeout(
      model.generateContent(parts),
      CLOUD_TIMEOUT_MS,
      'Voice transcription'
    );
    const transcript = result.response.text().trim();
    if (!transcript) {
      throw new Error('Could not hear any speech. Please try again.');
    }
    setLastFirebaseError(null);
    return transcript;
  } catch (err) {
    setLastFirebaseError(err);
    throw new Error(
      'Could not transcribe your voice recording. Please try speaking again or type your details.'
    );
  }
}

export async function lookupFlightArrivalWithFirebase(
  flightNumber: string,
  flightDate?: string | null
): Promise<FlightLookupResult> {
  const empty: FlightLookupResult = {
    found: false,
    airportIata: null,
    airportName: null,
    airportCountry: null,
    landingLocalISO: null,
  };

  if (!ai || !isFirebaseConfigured) {
    return empty;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return empty;
  }

  const cleanFlight = flightNumber.trim();
  if (!cleanFlight) return empty;

  const dateContext = flightDate?.trim() ? ` on date ${flightDate.trim()}` : '';
  const prompt = [
    `Look up the scheduled arrival airport and scheduled landing time for flight ${cleanFlight}${dateContext}.`,
    'Return ONLY a single JSON object with keys:',
    '{"found": boolean, "airportIata": string|null, "airportName": string|null, "airportCountry": string|null, "landingLocalISO": string|null}',
    'Rules:',
    '- Set airportIata, airportName, airportCountry only if confirmed in search results.',
    '- Set landingLocalISO (such as "2026-11-25T14:35") only if you verified the real scheduled landing time for that flight and date from search results; otherwise null.',
    '- Set found=true only when landingLocalISO is confirmed.',
    '- Never guess or invent an airport or landing time.',
  ].join('\n');

  try {
    const model = getHybridModel({
      mode: InferenceMode.ONLY_IN_CLOUD,
      tools: [{ googleSearch: {} }],
    });
    const result = await withTimeout(
      model.generateContent(prompt),
      CLOUD_TIMEOUT_MS,
      'Flight lookup'
    );
    const candidate = result.response.candidates?.[0];
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const parsed = extractJsonObject(result.response.text());
    if (!parsed || chunks.length === 0) {
      return empty;
    }

    const landingLocalISO = cleanNullableString(parsed.landingLocalISO);
    const airportIata = cleanNullableString(parsed.airportIata);
    const airportName = cleanNullableString(parsed.airportName);
    const airportCountry = cleanNullableString(parsed.airportCountry);

    setLastFirebaseError(null);
    return {
      found: Boolean(landingLocalISO) && parsed.found === true,
      airportIata: airportIata ? airportIata.toUpperCase().slice(0, 4) : null,
      airportName,
      airportCountry,
      landingLocalISO,
    };
  } catch (err) {
    setLastFirebaseError(err);
    return empty;
  }
}

function isAllowedDomainUrl(rawUrl: unknown, allowedDomains: string[]): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase();
    const matched = allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
    return matched ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function fetchOfficialFaresWithFirebase(
  routeKey: VerifiedRouteKey
): Promise<Record<string, Price>> {
  if (!ai || !isFirebaseConfigured) {
    throw new Error("Porter isn't configured yet. Add the Firebase settings in your environment.");
  }

  const cfg = VERIFIED_ROUTES[routeKey];
  const publicOpt = cfg.options.find((o) => o.mode === 'public');
  const taxiOpt = cfg.options.find((o) => o.mode === 'taxi');
  const rentalOpt = cfg.options.find((o) => o.mode === 'rental');
  const optionIds = [publicOpt?.id, taxiOpt?.id, rentalOpt?.id].filter(
    (v): v is string => Boolean(v)
  );
  const currency =
    routeKey === 'lhr-london' ? 'GBP' : routeKey === 'hnd-tokyo' ? 'JPY' : 'THB';
  const today = new Date().toISOString().slice(0, 10);

  const prompt = [
    `Look up current official fares for ${cfg.label} using ONLY these official operator websites: ${cfg.officialDomains.join(', ')}.`,
    `Search guidance: ${cfg.searchQueryHint}`,
    'Return ONLY a single JSON object with this shape:',
    `{"fares":[{"optionId":"${publicOpt?.id ?? ''}","min":number|null,"max":number|null,"currency":"${currency}","sourceUrl":string|null},{"optionId":"${taxiOpt?.id ?? ''}","min":number|null,"max":number|null,"currency":"${currency}","sourceUrl":string|null},{"optionId":"${rentalOpt?.id ?? ''}","min":number|null,"max":number|null,"currency":"${currency}","sourceUrl":string|null}]}`,
    'Strict rules:',
    `- Every sourceUrl MUST be a real URL from one of: ${cfg.officialDomains.join(', ')}.`,
    '- If an official fare range or ticket price is not explicitly found on one of those official operator websites, return min: null, max: null, sourceUrl: null.',
    '- Never guess or invent a fare.',
  ].join('\n');

  try {
    const model = getHybridModel({
      mode: InferenceMode.ONLY_IN_CLOUD,
      tools: [{ googleSearch: {} }],
    });
    const result = await withTimeout(
      model.generateContent(prompt),
      CLOUD_TIMEOUT_MS,
      'Official fare check'
    );
    const chunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const groundedDomains = new Set<string>();
    const groundedDomainUrls = new Map<string, string>();
    for (const ch of chunks) {
      const web = (ch as { web?: { title?: string; uri?: string } }).web;
      const title = web?.title?.toLowerCase() ?? '';
      const uri = web?.uri ?? '';
      for (const dom of cfg.officialDomains) {
        if (title.includes(dom) || uri.toLowerCase().includes(dom)) {
          groundedDomains.add(dom);
          if (!groundedDomainUrls.has(dom)) {
            groundedDomainUrls.set(dom, `https://${dom}/`);
          }
        }
      }
    }

    const parsed = extractJsonObject(result.response.text());
    const rawFares = Array.isArray(parsed?.fares)
      ? (parsed.fares as Array<Record<string, unknown>>)
      : [];

    const resultFares: Record<string, Price> = {};
    for (const item of rawFares) {
      const optionId = typeof item.optionId === 'string' ? item.optionId : '';
      if (!optionIds.includes(optionId)) continue;

      const min =
        typeof item.min === 'number' && Number.isFinite(item.min) ? item.min : null;
      const max =
        typeof item.max === 'number' && Number.isFinite(item.max) ? item.max : min;
      if (min === null || max === null || min <= 0 || max < min) {
        resultFares[optionId] = null;
        continue;
      }

      let verifiedUrl = isAllowedDomainUrl(item.sourceUrl, cfg.officialDomains);
      if (!verifiedUrl && groundedDomains.size > 0) {
        const firstDom = Array.from(groundedDomains)[0];
        verifiedUrl = groundedDomainUrls.get(firstDom) ?? null;
      }
      if (!verifiedUrl) {
        resultFares[optionId] = null;
        continue;
      }

      resultFares[optionId] = {
        min,
        max,
        currency:
          typeof item.currency === 'string' && item.currency.trim()
            ? item.currency.trim().toUpperCase()
            : currency,
        status: 'verified',
        source: verifiedUrl,
        verifiedOn: today,
      };
    }

    setLastFirebaseError(null);
    return resultFares;
  } catch (err) {
    setLastFirebaseError(err);
    throw err;
  }
}

export async function checkSingleOptionPriceWithFirebase(params: {
  airportName: string | null;
  airportIata: string | null;
  hotelName: string | null;
  optionTitle: string;
  mode: string;
}): Promise<Price> {
  if (!ai || !isFirebaseConfigured) {
    return null;
  }
  const airportDesc = [params.airportName, params.airportIata].filter(Boolean).join(' ');
  if (!airportDesc) return null;

  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    `Look up the official operator or official airport fare for "${params.optionTitle}" (${params.mode || 'transit'}) from ${airportDesc} to ${params.hotelName || 'city center'}.`,
    'Return ONLY JSON: {"min":number|null,"max":number|null,"currency":string|null,"sourceUrl":string|null}',
    'Rules:',
    '- Only include numbers explicitly published on an official airport or transit operator site.',
    '- If no official fare can be confirmed, return all fields null. Never guess.',
  ].join('\n');

  try {
    const model = getHybridModel({
      mode: InferenceMode.ONLY_IN_CLOUD,
      tools: [{ googleSearch: {} }],
    });
    const result = await withTimeout(
      model.generateContent(prompt),
      CLOUD_TIMEOUT_MS,
      'Price lookup'
    );
    const chunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const parsed = extractJsonObject(result.response.text());
    if (!parsed || chunks.length === 0) {
      return null;
    }

    const min =
      typeof parsed.min === 'number' && Number.isFinite(parsed.min) ? parsed.min : null;
    const max =
      typeof parsed.max === 'number' && Number.isFinite(parsed.max) ? parsed.max : min;
    const currency =
      typeof parsed.currency === 'string' ? parsed.currency.trim().toUpperCase() : '';
    const sourceUrl =
      typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl.trim() : '';

    if (
      min === null ||
      max === null ||
      min <= 0 ||
      max < min ||
      currency.length < 3 ||
      !/^https?:\/\//i.test(sourceUrl)
    ) {
      return null;
    }

    setLastFirebaseError(null);
    return {
      min,
      max,
      currency,
      status: 'unverified',
      source: sourceUrl,
      verifiedOn: today,
    };
  } catch (err) {
    setLastFirebaseError(err);
    return null;
  }
}

export async function translateWithFirebase(params: {
  targetLanguage: string;
  answerText: string | null;
  titles: string[];
  isOnline: boolean;
}): Promise<{ translatedAnswer: string | null; translatedTitles: string[] } | null> {
  if (!ai || !isFirebaseConfigured) {
    return null;
  }

  const schema = Schema.object({
    properties: {
      translatedAnswer: Schema.string({ nullable: true }),
      translatedTitles: Schema.array({ items: Schema.string() }),
    },
  });

  const instruction = [
    `Translate only the prose in answerText and titles into ${params.targetLanguage}.`,
    'CRITICAL RULES:',
    '- Keep every __KEEP_0__, __KEEP_1__, etc. token completely unchanged and in place.',
    '- NEVER translate or alter numbers, prices, currencies, times, phone numbers, or street addresses.',
    '- Return JSON matching the schema.',
  ].join('\n');

  const payload = JSON.stringify({
    targetLanguage: params.targetLanguage,
    answerText: params.answerText,
    titles: params.titles,
  });

  const mode = params.isOnline
    ? InferenceMode.ONLY_IN_CLOUD
    : InferenceMode.ONLY_ON_DEVICE;
  const timeoutMs = params.isOnline ? CLOUD_TIMEOUT_MS : ON_DEVICE_TIMEOUT_MS;

  try {
    const model = getHybridModel({
      mode,
      systemInstruction: instruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
    });
    const result = await withTimeout(
      model.generateContent(payload),
      timeoutMs,
      'Translation'
    );
    const parsed = extractJsonObject(result.response.text());
    if (!parsed || !Array.isArray(parsed.translatedTitles)) {
      return null;
    }
    setLastFirebaseError(null);
    return {
      translatedAnswer:
        typeof parsed.translatedAnswer === 'string' ? parsed.translatedAnswer : null,
      translatedTitles: parsed.translatedTitles.map((t) =>
        typeof t === 'string' ? t : ''
      ),
    };
  } catch (err) {
    setLastFirebaseError(err);
    return null;
  }
}
