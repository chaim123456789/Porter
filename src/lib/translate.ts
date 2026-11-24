import { translateWithFirebase } from '../engine/firebaseEngine';
import { formatPrice } from '../engine/validate';
import type { TripPlan } from '../types';

export const SUPPORTED_LANGUAGES = [
  'English',
  'Japanese',
  'Thai',
  'French',
  'Spanish',
  'German',
  'Italian',
  'Portuguese',
  'Chinese',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface TranslationOutput {
  translatedAnswer: string | null;
  translatedTitles: Record<string, string>;
  unavailable: boolean;
}

export type TranslatorFn = (params: {
  targetLanguage: string;
  answerText: string | null;
  titles: string[];
  isOnline: boolean;
}) => Promise<{ translatedAnswer: string | null; translatedTitles: string[] } | null>;

function buildProtectedTokens(plan: TripPlan): string[] {
  const tokens: string[] = [];
  if (plan.hotel.phone) tokens.push(plan.hotel.phone);
  if (plan.hotel.address) tokens.push(plan.hotel.address);
  if (plan.flight.number) tokens.push(plan.flight.number);
  for (const opt of plan.options) {
    if (opt.price) {
      tokens.push(formatPrice(opt.price));
    }
  }
  return Array.from(new Set(tokens.filter((t) => t.trim().length > 0))).sort(
    (a, b) => b.length - a.length
  );
}

function maskProtectedStrings(
  text: string,
  protectedTokens: string[]
): { masked: string; map: Array<{ placeholder: string; value: string }> } {
  let masked = text;
  const map: Array<{ placeholder: string; value: string }> = [];

  for (const val of protectedTokens) {
    if (masked.includes(val)) {
      const placeholder = `__KEEP_${map.length}__`;
      masked = masked.split(val).join(placeholder);
      map.push({ placeholder, value: val });
    }
  }

  return { masked, map };
}

function restoreProtectedStrings(
  text: string,
  map: Array<{ placeholder: string; value: string }>
): { restored: string; intact: boolean } {
  let restored = text;
  for (const item of map) {
    if (!restored.includes(item.placeholder)) {
      return { restored: text, intact: false };
    }
    restored = restored.split(item.placeholder).join(item.value);
  }
  return { restored, intact: true };
}

function verifyUnalteredSensitiveValues(
  sourceText: string,
  translatedText: string,
  plan: TripPlan
): boolean {
  const mustStay: string[] = [];
  if (plan.hotel.phone && sourceText.includes(plan.hotel.phone)) {
    mustStay.push(plan.hotel.phone);
  }
  if (plan.hotel.address && sourceText.includes(plan.hotel.address)) {
    mustStay.push(plan.hotel.address);
  }
  const currencyMatches =
    sourceText.match(
      /(?:[£$€¥฿]\s?\d+(?:[.,–-]\d+)*|\b\d+(?:[.,–-]\d+)*\s?(?:GBP|USD|EUR|JPY|THB)\b)/gi
    ) ?? [];
  for (const m of currencyMatches) {
    mustStay.push(m);
  }

  return mustStay.every((val) => translatedText.includes(val));
}

export async function translateAnswerAndTitles(params: {
  targetLanguage: SupportedLanguage;
  plan: TripPlan;
  answerText: string | null;
  isOnline: boolean;
  translator?: TranslatorFn;
}): Promise<TranslationOutput> {
  const { targetLanguage, plan, answerText, isOnline } = params;
  const runTranslator = params.translator ?? translateWithFirebase;

  if (targetLanguage === 'English') {
    return {
      translatedAnswer: null,
      translatedTitles: {},
      unavailable: false,
    };
  }

  const protectedTokens = buildProtectedTokens(plan);
  const maskedAnswerInfo = answerText
    ? maskProtectedStrings(answerText, protectedTokens)
    : null;
  const sourceTitles = plan.options.map((o) => o.title);

  const rawResult = await runTranslator({
    targetLanguage,
    answerText: maskedAnswerInfo?.masked ?? null,
    titles: sourceTitles,
    isOnline,
  });

  if (!rawResult) {
    return {
      translatedAnswer: null,
      translatedTitles: {},
      unavailable: true,
    };
  }

  let finalAnswer: string | null = null;
  if (answerText && maskedAnswerInfo) {
    if (!rawResult.translatedAnswer) {
      return {
        translatedAnswer: null,
        translatedTitles: {},
        unavailable: true,
      };
    }
    const restored = restoreProtectedStrings(
      rawResult.translatedAnswer,
      maskedAnswerInfo.map
    );
    if (
      !restored.intact ||
      !verifyUnalteredSensitiveValues(answerText, restored.restored, plan)
    ) {
      return {
        translatedAnswer: null,
        translatedTitles: {},
        unavailable: true,
      };
    }
    finalAnswer = restored.restored;
  }

  const titleMap: Record<string, string> = {};
  plan.options.forEach((opt, idx) => {
    const t = rawResult.translatedTitles?.[idx];
    if (typeof t === 'string' && t.trim()) {
      titleMap[opt.id] = t.trim();
    }
  });

  return {
    translatedAnswer: finalAnswer,
    translatedTitles: titleMap,
    unavailable: false,
  };
}
