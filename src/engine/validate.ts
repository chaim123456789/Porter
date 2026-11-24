import type { Price, RouteOption, TripPlan } from '../types';
import { matchVerifiedRoute, VERIFIED_ROUTES } from '../data/verifiedRoutes';

export function formatPrice(price: Price): string {
  if (!price) {
    return 'Unknown — check price at counter';
  }
  const same = price.min === price.max;
  const formatNum = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2));
  const range = same ? formatNum(price.min) : `${formatNum(price.min)}–${formatNum(price.max)}`;
  const symbolMap: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
    JPY: '¥',
    THB: '฿',
  };
  const sym = symbolMap[price.currency.toUpperCase()];
  const formatted = sym ? `${sym}${range}` : `${price.currency} ${range}`;
  if (price.status === 'unverified') {
    return `${formatted} (unverified — check price at counter)`;
  }
  return formatted;
}

export function formatDuration(durationMin: RouteOption['durationMin']): string {
  if (!durationMin) {
    return 'Duration unknown';
  }
  if (durationMin.min === durationMin.max) {
    return `${durationMin.min} min`;
  }
  return `${durationMin.min}–${durationMin.max} min`;
}

function collectAllowedNumbers(planJson: string, userQuestion: string): Set<string> {
  const allowed = new Set<string>();
  const combined = `${planJson} ${userQuestion}`;
  const matches = combined.match(/\d+(?:[.,]\d+)*/g) ?? [];
  for (const token of matches) {
    allowed.add(token);
    allowed.add(token.replace(/[.,]/g, ''));
    for (const part of token.split(/[.,]/)) {
      if (part) allowed.add(part);
    }
  }
  return allowed;
}

function isTokenAllowed(numStr: string, allowed: Set<string>): boolean {
  if (allowed.has(numStr)) return true;
  const stripped = numStr.replace(/[.,\s-]/g, '');
  if (stripped && allowed.has(stripped)) return true;
  return false;
}

/**
 * Strips or flags any currency amount, clock time, phone number, platform/door/gate
 * number, or multi-digit number in model output that does not exist in the saved
 * plan JSON or the user's own question.
 */
export function validateModelAnswer(
  rawAnswer: string,
  planJson: string,
  userQuestion: string
): { text: string; strippedCount: number } {
  const allowed = collectAllowedNumbers(planJson, userQuestion);
  let strippedCount = 0;
  let text = rawAnswer.trim();

  // 1. Check currency amounts (e.g., £25, $30, €15, ¥2000, ฿500, 25 GBP)
  text = text.replace(
    /(?:[£$€¥฿]\s?\d+(?:[.,]\d+)?(?:\s?[–-]\s?[£$€¥฿]?\d+(?:[.,]\d+)?)?|\b\d+(?:[.,]\d+)?(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?\s?(?:GBP|USD|EUR|JPY|THB|baht|yen|pounds|dollars|euros)\b)/gi,
    (match) => {
      const nums = match.match(/\d+(?:[.,]\d+)?/g) ?? [];
      if (nums.length > 0 && nums.every((n) => isTokenAllowed(n, allowed))) {
        return match;
      }
      strippedCount += 1;
      return 'Unknown — check price at counter';
    }
  );

  // 2. Check phone numbers (7+ digits with optional +, spaces, dashes, parens)
  text = text.replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, (match) => {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length < 6) return match;
    if (isTokenAllowed(digitsOnly, allowed) || planJson.includes(match.trim())) {
      return match;
    }
    strippedCount += 1;
    return '(hotel phone unknown — check booking)';
  });

  // 3. Check clock times (e.g., 14:30, 9:15 am, 11 pm)
  text = text.replace(
    /\b(?:\d{1,2}:\d{2}(?:\s?[ap]m)?|\d{1,2}\s?(?:am|pm))\b/gi,
    (match) => {
      const nums = match.match(/\d+/g) ?? [];
      if (nums.length > 0 && nums.every((n) => isTokenAllowed(n, allowed))) {
        return match;
      }
      strippedCount += 1;
      return 'local schedule time (check timetable)';
    }
  );

  // 4. Check platform / door / gate / terminal / bay / exit identifiers
  text = text.replace(
    /\b(platform|door|gate|terminal|bay|exit|stand)\s+#?([A-Za-z0-9-]+)\b/gi,
    (match, noun: string, code: string) => {
      if (!/\d/.test(code)) return match;
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wholeWord = new RegExp(`\\b${escaped}\\b`, 'i');
      if (wholeWord.test(planJson) || wholeWord.test(userQuestion) || isTokenAllowed(code, allowed)) {
        return match;
      }
      strippedCount += 1;
      return `${noun} (check airport signs)`;
    }
  );

  // 5. Check remaining standalone multi-digit numbers (e.g., unverified minutes/distances)
  text = text.replace(/\b\d{2,}\b/g, (match) => {
    if (isTokenAllowed(match, allowed)) {
      return match;
    }
    strippedCount += 1;
    return '(unverified number)';
  });

  return { text, strippedCount };
}

export interface PlanValidationResult {
  valid: boolean;
  reason?: string;
}

function urlMatchesAnyDomain(urlStr: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * Validates every TripPlan before saving or replacing:
 * - No invented currency prices or phone numbers inside step/backup text
 * - Every price has a source URL (and official domain when verified) or is null
 * - Every duration is within a plausible range (3..360 min, min <= max)
 * - Every step is non-empty
 */
export function validateTripPlan(plan: TripPlan): PlanValidationResult {
  if (!plan || typeof plan.id !== 'string' || !plan.id.trim()) {
    return { valid: false, reason: 'Missing trip identifier.' };
  }

  if (!Array.isArray(plan.options) || plan.options.length === 0) {
    return { valid: false, reason: 'Plan has no route options.' };
  }

  const verifiedKey = matchVerifiedRoute(plan);
  const allowedDomains = verifiedKey ? VERIFIED_ROUTES[verifiedKey].officialDomains : null;

  for (const opt of plan.options) {
    if (!opt.title || typeof opt.title !== 'string' || !opt.title.trim()) {
      return { valid: false, reason: 'Route option is missing a title.' };
    }

    if (!Array.isArray(opt.steps) || opt.steps.length === 0) {
      return { valid: false, reason: `Route "${opt.title}" has no steps.` };
    }

    for (const step of opt.steps) {
      if (typeof step !== 'string' || !step.trim()) {
        return { valid: false, reason: `Route "${opt.title}" contains an empty step.` };
      }
      // Disallow ungrounded currency amounts inside route step prose
      if (/[£$€¥฿]\s?\d+|\b\d+\s?(?:GBP|USD|EUR|JPY|THB)\b/i.test(step)) {
        return { valid: false, reason: `Route "${opt.title}" contains an unverified price in steps.` };
      }
    }

    if (Array.isArray(opt.backup)) {
      for (const b of opt.backup) {
        if (typeof b !== 'string' || !b.trim()) {
          return { valid: false, reason: `Route "${opt.title}" contains an empty backup step.` };
        }
        if (/[£$€¥฿]\s?\d+|\b\d+\s?(?:GBP|USD|EUR|JPY|THB)\b/i.test(b)) {
          return { valid: false, reason: `Route "${opt.title}" contains an unverified price in backup.` };
        }
      }
    }

    if (opt.durationMin !== null) {
      const { min, max } = opt.durationMin;
      if (
        typeof min !== 'number' ||
        typeof max !== 'number' ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min < 3 ||
        max > 360 ||
        min > max
      ) {
        return { valid: false, reason: `Route "${opt.title}" has an implausible duration.` };
      }
    }

    if (opt.price !== null) {
      const { min, max, currency, source, verifiedOn, status } = opt.price;
      if (
        typeof min !== 'number' ||
        typeof max !== 'number' ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min <= 0 ||
        min > max
      ) {
        return { valid: false, reason: `Route "${opt.title}" has an invalid price range.` };
      }
      if (typeof currency !== 'string' || currency.trim().length < 3) {
        return { valid: false, reason: `Route "${opt.title}" is missing a valid currency.` };
      }
      if (typeof source !== 'string' || !/^https?:\/\//i.test(source.trim())) {
        return { valid: false, reason: `Route "${opt.title}" price is missing a source URL.` };
      }
      if (typeof verifiedOn !== 'string' || !verifiedOn.trim()) {
        return { valid: false, reason: `Route "${opt.title}" price is missing a verification date.` };
      }
      if (status === 'verified' && allowedDomains && !urlMatchesAnyDomain(source.trim(), allowedDomains)) {
        return {
          valid: false,
          reason: `Route "${opt.title}" price source is not an official operator domain.`,
        };
      }
    }
  }

  return { valid: true };
}
