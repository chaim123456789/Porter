import type { Price, TripPlan } from '../types';
import { matchVerifiedRoute } from '../data/verifiedRoutes';
import {
  checkSingleOptionPriceWithFirebase,
  fetchOfficialFaresWithFirebase,
} from '../engine/firebaseEngine';
import { validateTripPlan } from '../engine/validate';

export interface FareRefreshResult {
  plan: TripPlan | null;
  error: string | null;
  validationFailed: boolean;
}

export async function refreshPlanWithOfficialFares(plan: TripPlan): Promise<FareRefreshResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      plan: null,
      error: 'Offline — keeping your saved plan.',
      validationFailed: false,
    };
  }

  const routeKey = matchVerifiedRoute(plan);
  if (!routeKey) {
    return {
      plan: null,
      error: null,
      validationFailed: false,
    };
  }

  try {
    const faresMap = await fetchOfficialFaresWithFirebase(routeKey);
    const nowIso = new Date().toISOString();

    const nextPlan: TripPlan = {
      ...plan,
      lastUpdated: nowIso,
      options: plan.options.map((opt) => {
        const fetchedPrice = opt.id in faresMap ? faresMap[opt.id] : undefined;
        return {
          ...opt,
          // Keep null if no official fare was verified; never invent one
          price: fetchedPrice !== undefined ? fetchedPrice : opt.price,
        };
      }),
    };

    const check = validateTripPlan(nextPlan);
    if (!check.valid) {
      return {
        plan: null,
        error: "Plan couldn't be verified. Please check prices at the counter.",
        validationFailed: true,
      };
    }

    return {
      plan: nextPlan,
      error: null,
      validationFailed: false,
    };
  } catch {
    return {
      plan: null,
      error: 'Could not reach official operator websites right now.',
      validationFailed: false,
    };
  }
}

export async function checkSingleOptionPrice(
  plan: TripPlan,
  optionId: string
): Promise<FareRefreshResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      plan: null,
      error: 'Connect once to check official prices.',
      validationFailed: false,
    };
  }

  const routeKey = matchVerifiedRoute(plan);
  if (routeKey) {
    return refreshPlanWithOfficialFares(plan);
  }

  const targetOption = plan.options.find((o) => o.id === optionId);
  if (!targetOption) {
    return { plan: null, error: null, validationFailed: false };
  }

  try {
    const fetchedPrice: Price = await checkSingleOptionPriceWithFirebase({
      airportName: plan.airport.name,
      airportIata: plan.airport.iata,
      hotelName: plan.hotel.name || plan.hotel.address,
      optionTitle: targetOption.title,
      mode: targetOption.mode,
    });

    if (!fetchedPrice) {
      return {
        plan: null,
        error: 'No official price could be confirmed online — check price at counter.',
        validationFailed: false,
      };
    }

    const nextPlan: TripPlan = {
      ...plan,
      lastUpdated: new Date().toISOString(),
      options: plan.options.map((opt) =>
        opt.id === optionId ? { ...opt, price: fetchedPrice } : opt
      ),
    };

    const check = validateTripPlan(nextPlan);
    if (!check.valid) {
      return {
        plan: null,
        error: "Plan couldn't be verified. Please check prices at the counter.",
        validationFailed: true,
      };
    }

    return {
      plan: nextPlan,
      error: null,
      validationFailed: false,
    };
  } catch {
    return {
      plan: null,
      error: 'Could not check official price right now.',
      validationFailed: false,
    };
  }
}
