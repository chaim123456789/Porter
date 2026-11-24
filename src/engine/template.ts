import type { ReplanOutput, RouteOption, TripPlan } from '../types';
import { formatDuration, formatPrice } from './validate';

export interface TemplateResult {
  answer: string;
  routeId: string | null;
  structured?: ReplanOutput;
}

export function formatReplanOutput(out: ReplanOutput): string {
  const parts: string[] = [];
  if (out.recommendation.trim()) parts.push(out.recommendation.trim());
  if (out.reason.trim()) parts.push(`Why: ${out.reason.trim()}`);
  if (out.steps.length > 0) {
    parts.push(
      `Steps: ${out.steps
        .slice(0, 6)
        .map((s, idx) => `${idx + 1}. ${s.trim()}`)
        .join(' ')}`
    );
  }
  if (out.fallback.trim()) {
    const fb = out.fallback.trim();
    parts.push(/^fallback:/i.test(fb) ? fb : `Fallback: ${fb}`);
  }
  if (out.unknowns.length > 0) {
    parts.push(`Unknowns: ${out.unknowns.join('; ')}`);
  }
  return parts.join(' ');
}

function getHotelLabel(plan: TripPlan): string {
  return plan.hotel.name || plan.hotel.address || 'your hotel';
}

function getAirportLabel(plan: TripPlan): string {
  if (plan.airport.name && plan.airport.iata) {
    return `${plan.airport.name} (${plan.airport.iata})`;
  }
  return plan.airport.name || plan.airport.iata || 'the airport';
}

function getOfficialTaxiFallback(plan: TripPlan, excludeId?: string): string {
  const taxiOption = plan.options.find((o) => o.mode === 'taxi' && o.id !== excludeId);
  if (taxiOption) {
    const priceText = formatPrice(taxiOption.price);
    return `If unavailable, take ${taxiOption.title} (${priceText}) from the official airport taxi rank.`;
  }
  return 'If unavailable, use the official airport taxi rank outside Arrivals — avoid anyone soliciting rides inside the terminal.';
}

function getBackupText(option: RouteOption, plan: TripPlan): string {
  if (option.backup && option.backup.length > 0 && option.backup[0].trim()) {
    return `Fallback: ${option.backup[0].trim()}`;
  }
  const alt = plan.options.find((o) => o.id !== option.id);
  if (alt) {
    return `Fallback: take ${alt.title} (${formatPrice(alt.price)}, ${formatDuration(alt.durationMin)}).`;
  }
  return `Fallback: ${getOfficialTaxiFallback(plan, option.id)}`;
}

function pickCheapestOption(options: RouteOption[]): RouteOption | null {
  if (options.length === 0) return null;
  const priced = options.filter((o) => o.price !== null);
  if (priced.length > 0) {
    return [...priced].sort((a, b) => (a.price!.min ?? Infinity) - (b.price!.min ?? Infinity))[0];
  }
  return options.find((o) => o.mode === 'public') ?? options[0];
}

function pickFastestOption(options: RouteOption[]): RouteOption | null {
  if (options.length === 0) return null;
  const timed = options.filter((o) => o.durationMin !== null);
  if (timed.length > 0) {
    return [...timed].sort(
      (a, b) => (a.durationMin!.min ?? Infinity) - (b.durationMin!.min ?? Infinity)
    )[0];
  }
  return options[0];
}

function pickSafestNightOption(options: RouteOption[]): RouteOption | null {
  if (options.length === 0) return null;
  const taxi = options.find((o) => o.mode === 'taxi');
  if (taxi) return taxi;
  return [...options].sort((a, b) => (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99))[0];
}

function pickLowWalkOption(options: RouteOption[]): RouteOption | null {
  if (options.length === 0) return null;
  const withWalk = options.filter((o) => o.walkMinutes !== null);
  if (withWalk.length > 0) {
    return [...withWalk].sort((a, b) => (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99))[0];
  }
  return options.find((o) => o.mode === 'taxi') ?? options[0];
}

function formatOptionSummary(option: RouteOption): string {
  const stepLead = option.steps[0] ? `${option.title}: ${option.steps[0]}` : `Take ${option.title}`;
  return stepLead.endsWith('.') ? stepLead : `${stepLead}.`;
}

function buildRouteReply(option: RouteOption, reason: string, plan: TripPlan): TemplateResult {
  const rec = formatOptionSummary(option);
  const priceText = formatPrice(option.price);
  const durText = formatDuration(option.durationMin);
  const fallback = getBackupText(option, plan);
  return {
    answer: `${rec} Why: ${reason} (${priceText}, ${durText}). ${fallback}`,
    routeId: option.id,
  };
}

export function runTemplate(
  question: string,
  plan: TripPlan,
  pickedRouteId?: string | null,
  trainCancelled?: boolean
): TemplateResult {
  const q = question.toLowerCase();
  const rawOptions = plan.options ?? [];
  const options = trainCancelled
    ? rawOptions.filter((o) => o.mode !== 'public')
    : rawOptions;
  const pickedOption = pickedRouteId
    ? options.find((o) => o.id === pickedRouteId) ?? null
    : null;
  const hotel = getHotelLabel(plan);
  const airport = getAirportLabel(plan);
  const hotelPhoneText = plan.hotel.phone
    ? `Call your hotel at ${plan.hotel.phone}`
    : 'Your hotel phone number is unknown in the saved plan — check your booking confirmation';

  // 0a. Cancelled train re-plan scenario
  if (trainCancelled && (q.includes('cancelled') || q.includes('canceled') || q.includes('re-plan') || q.includes('replan'))) {
    const remaining = options.find((o) => o.mode === 'taxi') ?? options[0] ?? null;
    if (remaining) {
      const otherBackup = options.find((o) => o.id !== remaining.id);
      const fallbackLine = otherBackup
        ? `Fallback: ${otherBackup.title} (${formatPrice(otherBackup.price)}, ${formatDuration(otherBackup.durationMin)}) or go to the ${airport} information desk.`
        : `Fallback: go to the staffed ${airport} information desk or ${hotelPhoneText.toLowerCase()}.`;
      return {
        answer: `The train is cancelled — take ${remaining.title} instead (${formatPrice(remaining.price)}, ${formatDuration(remaining.durationMin)}). Why: rail service is unavailable, and ${remaining.title} runs directly from Arrivals to ${hotel}. ${fallbackLine}`,
        routeId: remaining.id,
      };
    }
    return {
      answer: `The train is cancelled — go to the official signed taxi rank outside ${airport} Arrivals to reach ${hotel}. Why: rail service is unavailable and a licensed airport taxi takes you directly to your door (Unknown — check price at counter). Fallback: ${hotelPhoneText} or ask at the airport information desk.`,
      routeId: null,
    };
  }

  // 0b. Disruption: "I missed my stop"
  if (/\b(missed my stop|missed stop|wrong stop|past my stop|missed the stop)\b/.test(q)) {
    const publicOpt = options.find((o) => o.mode === 'public');
    const stopsHint =
      publicOpt && publicOpt.stops.length > 0
        ? `along your saved route (${publicOpt.stops.join(' → ')})`
        : 'along your current line';
    const taxiOpt = options.find((o) => o.mode === 'taxi');
    const taxiFallback = taxiOpt
      ? `take an official ${taxiOpt.title} from outside the station (${formatPrice(taxiOpt.price)})`
      : `use an official licensed taxi outside the station or ${hotelPhoneText.toLowerCase()}`;
    return {
      answer: `Get off at the very next staffed station stop ${stopsHint} (specific stop names and platforms are not listed in your plan — check the train display or ask staff). Why: stepping off at a staffed station keeps you safe indoors where you can cross to the opposite direction and ride back toward ${hotel}. Fallback: if return service has stopped, ${taxiFallback}.`,
      routeId: publicOpt?.id ?? null,
    };
  }

  // 0c. Disruption: "It's 2am, what's safe?"
  if (/\b(2am|2 am|two am|what's safe|whats safe)\b/.test(q)) {
    const safeOpt = pickSafestNightOption(options);
    const realAction = plan.hotel.phone
      ? `call ${hotel} at ${plan.hotel.phone} to confirm late check-in, or speak with the staffed ${airport} information desk before stepping outside.`
      : `go to the staffed ${airport} information desk to confirm the official taxi rank location (hotel phone is unknown in your saved plan).`;
    if (safeOpt) {
      return {
        answer: `At 2am, take ${safeOpt.title} (${formatPrice(safeOpt.price)}, ${formatDuration(safeOpt.durationMin)}). Why: ${safeOpt.scamWarning ? safeOpt.scamWarning + ' ' : ''}it is the safest late-night option to ${hotel} with minimal waiting or street walking. Fallback: ${realAction}`,
        routeId: safeOpt.id,
      };
    }
    return {
      answer: `At 2am, use the official airport taxi rank outside ${airport} Arrivals or an official airport night bus to ${hotel}. Why: signed official ranks avoid terminal touts and isolated late-night walks (Unknown — check price at counter). Fallback: ${realAction}`,
      routeId: null,
    };
  }

  // 0d. Explicit "Tell me more about <option>" or specific option mention
  const mentionedOption = options.find((o) => q.includes(o.title.toLowerCase()));
  if (mentionedOption && (q.includes('tell me more') || q.includes('explain') || q.includes('details'))) {
    const stepsText = mentionedOption.steps.join(' ');
    const transferText =
      mentionedOption.transfers !== null ? `${mentionedOption.transfers} transfer(s)` : 'transfers unknown';
    const feeText =
      mentionedOption.hiddenFees && mentionedOption.hiddenFees.length > 0
        ? ` Note fees: ${mentionedOption.hiddenFees[0]}.`
        : '';
    return buildRouteReply(
      mentionedOption,
      `${stepsText} (${transferText}).${feeText}`,
      plan
    );
  }

  // 1. Police / emergency / help
  if (/\b(police|emergency|help|lost|stolen|theft|danger|unsafe|hospital|medical)\b/.test(q)) {
    const deskAction = `${hotelPhoneText}, go to the staffed airport information desk in Arrivals, or use the official signed taxi rank.`;
    return {
      answer: `Go straight to the staffed airport information desk or security post inside ${airport}. Why: airport staff can connect you to local police or medical help and verify safe transport to ${hotel}. Fallback: ${deskAction}`,
      routeId: null,
    };
  }

  // 2. Hotel / reception / check-in / door / entrance / policy
  const isRoutePhrasing = /\b(get to|getting to|reach|route|way|recommend|recommendation|picked|pick|cheapest|fastest|safest|night|stroller|kids|bags|luggage|walk|wheelchair|changed|new hotel)\b/.test(q);
  if (
    /\b(reception|check-in|check in|checkin|door|entrance|late arrival|cancel|cancellation|key|address|phone)\b/.test(q) ||
    (/\bhotel\b/.test(q) && !isRoutePhrasing)
  ) {
    const notes: string[] = [];
    if (plan.hotel.receptionNote) notes.push(`Reception: ${plan.hotel.receptionNote}`);
    if (plan.hotel.lateArrivalPolicy) notes.push(`Late arrival: ${plan.hotel.lateArrivalPolicy}`);
    if (plan.hotel.entranceNote) notes.push(`Entrance: ${plan.hotel.entranceNote}`);
    if (plan.hotel.cancellationPolicy) notes.push(`Cancellation: ${plan.hotel.cancellationPolicy}`);

    const addressPart = plan.hotel.address
      ? `Head to ${hotel} at ${plan.hotel.address}.`
      : `Head to ${hotel} (exact street address is unknown in the saved plan).`;
    const whyPart =
      notes.length > 0
        ? notes.join(' · ')
        : 'no reception or late-arrival notes were saved from your booking, so confirm directly on arrival.';
    return {
      answer: `${addressPart} Why: ${whyPart} Fallback: ${hotelPhoneText} before leaving ${airport} if you arrive late.`,
      routeId: null,
    };
  }

  // 3. Toilet / bathroom
  if (/\b(toilet|toilets|bathroom|bathrooms|restroom|restrooms|wc|washroom|loo)\b/.test(q)) {
    return {
      answer: `Use the restrooms inside ${airport} Arrivals before exiting to transit or the taxi rank. Why: terminal facilities are free and accessible before you board trains or cars to ${hotel}. Fallback: ask at the Arrivals information desk for the nearest family or accessible restroom.`,
      routeId: null,
    };
  }

  // 4. Food / eat / coffee
  if (/\b(food|eat|coffee|drink|water|hungry|snack|breakfast|dinner|lunch|cafe)\b/.test(q)) {
    return {
      answer: `Grab water or quick food in the ${airport} Arrivals concourse before heading to ${hotel}. Why: it keeps you supplied if transit runs slowly or your hotel reception has limited late-night service. Fallback: if terminal shops are closed, check the convenience store near the main rail concourse or ask ${hotel} on arrival (${plan.hotel.phone ?? 'phone unknown'}).`,
      routeId: null,
    };
  }

  // 5. Smoke / smoking
  if (/\b(smoke|smoking|cigarette|vape|tobacco)\b/.test(q)) {
    return {
      answer: `Use only the marked outdoor smoking areas outside ${airport} Arrivals before entering transit. Why: airport terminals, trains, and licensed taxis prohibit smoking with strict fines. Fallback: follow exterior terminal signs away from the main doors, or wait until you reach ${hotel}.`,
      routeId: null,
    };
  }

  // 6. Prayer / pray
  if (/\b(prayer|pray|mosque|chapel|quiet room|meditation)\b/.test(q)) {
    return {
      answer: `Ask at the ${airport} Arrivals information desk for the terminal multi-faith prayer or quiet room before leaving for ${hotel}. Why: major airport terminals keep signed prayer rooms inside the main passenger hall. Fallback: if it is closed after hours, ask airport staff for a quiet waiting area before boarding your ride.`,
      routeId: null,
    };
  }

  // 7. Cheapest / price
  if (/\b(cheapest|cheap|price|cost|budget|fare|money|expensive)\b/.test(q)) {
    const cheapest = pickCheapestOption(options);
    if (cheapest) {
      const transfersText =
        cheapest.transfers !== null ? `${cheapest.transfers} transfer(s)` : 'lowest fare saved';
      return buildRouteReply(
        cheapest,
        `it is the lowest-cost option saved (${transfersText})`,
        plan
      );
    }
    return {
      answer: `Take the public airport train or bus from ${airport} toward ${hotel}. Why: public transit is normally the lowest-cost option, and exact prices are not in your saved plan yet (Unknown — check price at counter). Fallback: check the official ticket desk in Arrivals or take the official airport taxi rank if public transit has stopped.`,
      routeId: null,
    };
  }

  // 8. Fastest
  if (/\b(fastest|fast|quick|quicker|quickly|express|hurry|soon)\b/.test(q)) {
    const fastest = pickFastestOption(options);
    if (fastest) {
      return buildRouteReply(
        fastest,
        `it has the shortest travel time in your saved plan`,
        plan
      );
    }
    return {
      answer: `Take the direct airport express rail or official taxi from ${airport} to ${hotel}. Why: direct connections avoid extra transfers, though exact route times are not in your saved plan yet (Unknown — check price at counter). Fallback: ask the Arrivals information desk which direct service departs next.`,
      routeId: null,
    };
  }

  // 9. Safest / night / late
  if (/\b(safest|safe|safety|night|late|dark|midnight|early morning|scam)\b/.test(q)) {
    const safest = pickSafestNightOption(options);
    if (safest) {
      const extra = safest.scamWarning ? `${safest.scamWarning} ` : '';
      return buildRouteReply(
        safest,
        `${extra}it goes door-to-door or minimizes late-night walking`,
        plan
      );
    }
    return {
      answer: `Use the official airport taxi rank outside ${airport} Arrivals to go directly to ${hotel}. Why: door-to-door licensed taxis avoid late-night street walking and terminal touts (Unknown — check price at counter). Fallback: ${hotelPhoneText} and ask the airport information desk to point you to the official taxi queue.`,
      routeId: null,
    };
  }

  // 10. Baby / stroller / buggy / kids
  if (/\b(baby|stroller|buggy|kid|kids|child|children|infant|toddler|family)\b/.test(q)) {
    const easy = pickLowWalkOption(options);
    if (easy) {
      const walkText =
        easy.walkMinutes !== null ? `only ${easy.walkMinutes} min walking` : 'fewer transfers';
      return buildRouteReply(
        easy,
        `it requires ${walkText} when moving with a stroller`,
        plan
      );
    }
    return {
      answer: `Take a door-to-door official airport taxi or step-free express train from ${airport} to ${hotel}. Why: minimizing street walking and stairs makes traveling with a stroller much easier (Unknown — check price at counter). Fallback: use the terminal elevators and ask at the official taxi rank for a larger vehicle.`,
      routeId: null,
    };
  }

  // 11. Wheelchair / step-free
  if (/\b(wheelchair|step-free|step free|accessible|accessibility|elevator|lift|ramp|mobility)\b/.test(q)) {
    const stepFree = pickLowWalkOption(options);
    if (stepFree) {
      const walkText =
        stepFree.walkMinutes !== null
          ? `${stepFree.walkMinutes} min walking`
          : 'minimal street distance';
      return buildRouteReply(
        stepFree,
        `it keeps ${walkText} and lets you avoid complex station changes`,
        plan
      );
    }
    return {
      answer: `Use an official accessible taxi from the signed rank at ${airport} or ask staff for step-free rail boarding to ${hotel}. Why: airport staff can confirm elevator status and curb-to-door drop-off (Unknown — check price at counter). Fallback: go to the Arrivals assistance desk or call ${plan.hotel.phone ?? 'your hotel from your booking'} to confirm step-free entrance access.`,
      routeId: null,
    };
  }

  // 12. Bags / luggage
  if (/\b(bags|bag|luggage|suitcase|suitcases|heavy|trolley|backpack)\b/.test(q)) {
    const lowTransfer =
      [...options].sort((a, b) => (a.transfers ?? 99) - (b.transfers ?? 99))[0] ?? null;
    if (lowTransfer) {
      const transfersText =
        lowTransfer.transfers !== null
          ? `${lowTransfer.transfers} transfer(s)`
          : 'minimal handling';
      return buildRouteReply(
        lowTransfer,
        `it minimizes transfers (${transfersText}) with heavy luggage`,
        plan
      );
    }
    return {
      answer: `Take an official airport taxi or direct express train with luggage racks from ${airport} to ${hotel}. Why: avoiding station stairs and transfers prevents struggling with heavy bags (Unknown — check price at counter). Fallback: use a terminal luggage trolley up to the official taxi rank outside Arrivals.`,
      routeId: null,
    };
  }

  // 13. Walking / walk
  if (/\b(walking|walk|foot|steps|stairs|far)\b/.test(q)) {
    const lowWalk = pickLowWalkOption(options);
    if (lowWalk) {
      const walkText =
        lowWalk.walkMinutes !== null
          ? `${lowWalk.walkMinutes} min total walking`
          : 'minimal walking';
      return buildRouteReply(
        lowWalk,
        `it has ${walkText} in your saved plan`,
        plan
      );
    }
    return {
      answer: `Choose a door-to-door official taxi from ${airport} directly to ${hotel}. Why: it drops you at the hotel entrance with minimal walking (Unknown — check price at counter). Fallback: if taking rail, check station maps at Arrivals for the closest exit to ${hotel}.`,
      routeId: null,
    };
  }

  // 14. Default / picked route recommendation
  if (pickedOption) {
    return buildRouteReply(
      pickedOption,
      `you picked this route from ${airport} to ${hotel}`,
      plan
    );
  }

  if (options.length > 0) {
    const primary = options[0];
    return buildRouteReply(
      primary,
      `it is the primary saved route from ${airport} to ${hotel}`,
      plan
    );
  }

  return {
    answer: `Go to the Arrivals transport desk or official signed taxi rank at ${airport} to reach ${hotel}. Why: route prices and times are not in your saved plan yet (Unknown — check price at counter), so official counters give verified fares before you ride. Fallback: ${hotelPhoneText} for local directions to the entrance.`,
    routeId: null,
  };
}
