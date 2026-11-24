import type { RouteOption, TripPlan } from '../types';

export type VerifiedRouteKey = 'lhr-london' | 'hnd-tokyo' | 'bkk-bangkok';

export interface VerifiedRouteConfig {
  key: VerifiedRouteKey;
  label: string;
  airportIata: string;
  airportName: string;
  airportCountry: string;
  officialDomains: string[];
  searchQueryHint: string;
  options: RouteOption[];
}

export const VERIFIED_ROUTES: Record<VerifiedRouteKey, VerifiedRouteConfig> = {
  'lhr-london': {
    key: 'lhr-london',
    label: 'Heathrow to Central London',
    airportIata: 'LHR',
    airportName: 'London Heathrow Airport',
    airportCountry: 'United Kingdom',
    officialDomains: [
      'tfl.gov.uk',
      'heathrowexpress.com',
      'heathrow.com',
      'nationalexpress.com',
    ],
    searchQueryHint:
      'Heathrow Airport to Central London Elizabeth line Underground TfL fare, Heathrow Express fare, official London black cab taxi fare range, and Heathrow car rental daily rate',
    options: [
      {
        id: 'lhr-public',
        mode: 'public',
        title: 'Elizabeth line or Piccadilly line',
        steps: [
          'Follow purple "Heathrow Rail" or blue "Underground" signs inside Arrivals.',
          'Tap a contactless bank card or Oyster card at the ticket gates and ride directly to Central London.',
        ],
        stops: ['Heathrow Terminals 2 & 3 / 4 / 5', 'Paddington / Central London'],
        durationMin: { min: 27, max: 55 },
        price: null,
        transfers: 0,
        walkMinutes: 8,
        hiddenFees: ['Peak vs off-peak fares apply on TfL services; Heathrow Express costs extra unless booked ahead'],
        insuranceIncluded: null,
        scamWarning: null,
        backup: ['Take the Piccadilly line Underground if Elizabeth line is disrupted, or use the official black cab rank.'],
      },
      {
        id: 'lhr-taxi',
        mode: 'taxi',
        title: 'Official London Black Cab',
        steps: [
          'Exit Arrivals following yellow "Taxi" signs to the staffed official rank outside the terminal.',
          'Give the driver your hotel address; fares run strictly on the official meter.',
        ],
        stops: ['Heathrow Official Taxi Rank', 'Your hotel door'],
        durationMin: { min: 45, max: 75 },
        price: null,
        transfers: 0,
        walkMinutes: 2,
        hiddenFees: ['Airport drop-off / rank pickup surcharge and luggage or late-night tariff may apply on the meter'],
        insuranceIncluded: null,
        scamWarning: 'Ignore anyone approaching you inside Arrivals offering a taxi or minicab. Only use the signed rank outside.',
        backup: ['Take the Elizabeth line from Heathrow Rail to Paddington and walk or take a short cab from the station rank.'],
      },
      {
        id: 'lhr-rental',
        mode: 'rental',
        title: 'Airport Car Rental (Heathrow)',
        steps: [
          'Follow "Car Rental" shuttle signs in Arrivals to the rental village.',
          'Check Central London Congestion Charge and hotel parking before driving into central streets.',
        ],
        stops: ['Heathrow Rental Village', 'Your hotel'],
        durationMin: { min: 50, max: 85 },
        price: null,
        transfers: 1,
        walkMinutes: 10,
        hiddenFees: [
          'London Congestion Charge and ULEZ rules may apply',
          'Central London hotel parking fees and security deposit',
          'Fuel policy and cross-city tolls',
        ],
        insuranceIncluded: false,
        scamWarning: 'Inspect the vehicle and photograph existing marks before leaving the Heathrow rental bay.',
        backup: ['If Central London driving or parking is too costly, take the Elizabeth line instead.'],
      },
    ],
  },
  'hnd-tokyo': {
    key: 'hnd-tokyo',
    label: 'Haneda to Central Tokyo',
    airportIata: 'HND',
    airportName: 'Tokyo Haneda Airport',
    airportCountry: 'Japan',
    officialDomains: [
      'tokyo-monorail.co.jp',
      'keikyu.co.jp',
      'tokyo-haneda.com',
      'limousinebus.co.jp',
      'jreast.co.jp',
    ],
    searchQueryHint:
      'Tokyo Haneda Airport to Central Tokyo Tokyo Monorail fare, Keikyu Line fare, official fixed-fare Haneda taxi to central Tokyo, and Haneda car rental daily rate',
    options: [
      {
        id: 'hnd-public',
        mode: 'public',
        title: 'Tokyo Monorail or Keikyu Line',
        steps: [
          'Follow "Monorail" or "Keikyu Line" signs right outside the International Arrivals lobby.',
          'Buy a ticket at the machine or tap a Suica/PASMO card to Hamamatsucho or Shinagawa.',
        ],
        stops: ['Haneda Terminal 3', 'Hamamatsucho / Shinagawa', 'Central Tokyo'],
        durationMin: { min: 20, max: 35 },
        price: null,
        transfers: 1,
        walkMinutes: 7,
        hiddenFees: ['IC card deposit if buying a new physical transit card at the machine'],
        insuranceIncluded: null,
        scamWarning: null,
        backup: ['Take the Airport Limousine Bus from the ground-floor bus counter if rail has stopped for the night.'],
      },
      {
        id: 'hnd-taxi',
        mode: 'taxi',
        title: 'Official Fixed-Fare Haneda Taxi',
        steps: [
          'Follow "Taxi" signs outside Terminal Arrivals to the official fixed-fare boarding lane for your Tokyo ward.',
          'Confirm fixed-fare zone with the dispatcher or driver before departing.',
        ],
        stops: ['Haneda Official Taxi Stand', 'Your hotel door'],
        durationMin: { min: 25, max: 45 },
        price: null,
        transfers: 0,
        walkMinutes: 2,
        hiddenFees: ['Expressway toll and late-night surcharge (22:00–05:00) are added to the fixed fare'],
        insuranceIncluded: null,
        scamWarning: 'Use only the official marked taxi queues outside Arrivals; avoid unlicensed ride offers.',
        backup: ['Take the Tokyo Monorail to Hamamatsucho or the Keikyu Line to Shinagawa.'],
      },
      {
        id: 'hnd-rental',
        mode: 'rental',
        title: 'Airport Car Rental (Haneda)',
        steps: [
          'Visit the car rental counter in the Arrivals lobby to check in and take the bay transfer.',
          'Confirm ETC toll card availability and International Driving Permit validity before pickup.',
        ],
        stops: ['Haneda Rental Counter', 'Your hotel'],
        durationMin: { min: 30, max: 55 },
        price: null,
        transfers: 1,
        walkMinutes: 8,
        hiddenFees: [
          'Shuto Expressway tolls and ETC card rental',
          'Tokyo hotel overnight parking fees',
          'International Driving Permit required at pickup',
        ],
        insuranceIncluded: false,
        scamWarning: 'Confirm whether CDW/NOC waiver coverage is included in the counter quote before signing.',
        backup: ['Take the Tokyo Monorail or official fixed-fare taxi if your hotel lacks parking.'],
      },
    ],
  },
  'bkk-bangkok': {
    key: 'bkk-bangkok',
    label: 'Suvarnabhumi to Central Bangkok',
    airportIata: 'BKK',
    airportName: 'Suvarnabhumi Airport',
    airportCountry: 'Thailand',
    officialDomains: [
      'bangkokairportrail.com',
      'srtet.co.th',
      'suvarnabhumiairport.com',
      'airportthai.co.th',
    ],
    searchQueryHint:
      'Suvarnabhumi Airport Bangkok Airport Rail Link fare to Phaya Thai, official Level 1 public metered taxi surcharge and fare to central Bangkok, and Suvarnabhumi car rental rate',
    options: [
      {
        id: 'bkk-public',
        mode: 'public',
        title: 'Airport Rail Link (City Line)',
        steps: [
          'Take the escalator or lift down to Level B1 following "Airport Rail Link" signs.',
          'Buy a token at the counter or machine to Makkasan (MRT) or Phaya Thai (BTS Skytrain).',
        ],
        stops: ['Suvarnabhumi B1', 'Makkasan / Phaya Thai', 'Central Bangkok'],
        durationMin: { min: 26, max: 45 },
        price: null,
        transfers: 1,
        walkMinutes: 8,
        hiddenFees: ['Separate BTS Skytrain or MRT ticket required after transferring in Central Bangkok'],
        insuranceIncluded: null,
        scamWarning: null,
        backup: ['Use the official Level 1 metered public taxi queue if arriving after Airport Rail Link operating hours.'],
      },
      {
        id: 'bkk-taxi',
        mode: 'taxi',
        title: 'Official Level 1 Public Metered Taxi',
        steps: [
          'Go down to Level 1 outside Gate 4 or Gate 7 and take a numbered ticket from the automatic taxi kiosk.',
          'Keep the printed ticket slip and make sure the driver turns the meter on.',
        ],
        stops: ['Suvarnabhumi Level 1 Taxi Queue', 'Your hotel door'],
        durationMin: { min: 35, max: 75 },
        price: null,
        transfers: 0,
        walkMinutes: 3,
        hiddenFees: ['Official airport pickup surcharge and expressway highway tolls paid directly in cash'],
        insuranceIncluded: null,
        scamWarning: 'Ignore touts on Level 2 Arrivals offering "limousine" or fixed-price taxis. Go to Level 1 metered queue and insist on the meter.',
        backup: ['Take the Airport Rail Link on Level B1 to avoid Bangkok highway traffic.'],
      },
      {
        id: 'bkk-rental',
        mode: 'rental',
        title: 'Airport Car Rental (Suvarnabhumi)',
        steps: [
          'Go to the licensed car rental counters inside the Level 2 Arrivals hall between Gates 7 and 8.',
          'Verify deposit hold and Bangkok toll/parking access with your hotel before driving.',
        ],
        stops: ['Suvarnabhumi Arrivals Rental Desk', 'Your hotel'],
        durationMin: { min: 45, max: 90 },
        price: null,
        transfers: 0,
        walkMinutes: 6,
        hiddenFees: [
          'Expressway tolls and credit card security deposit',
          'International Driving Permit required alongside home license',
          'Bangkok peak traffic delays',
        ],
        insuranceIncluded: false,
        scamWarning: 'Only rent from counters inside Level 2 Arrivals and inspect the vehicle condition report.',
        backup: ['Take the Airport Rail Link or Level 1 metered taxi instead of driving in central Bangkok traffic.'],
      },
    ],
  },
};

export function matchVerifiedRoute(plan: TripPlan): VerifiedRouteKey | null {
  const iata = (plan.airport.iata ?? '').toUpperCase().trim();
  const haystack = [
    plan.airport.name ?? '',
    plan.airport.country ?? '',
    plan.hotel.name ?? '',
    plan.hotel.address ?? '',
    plan.flight.number ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (iata === 'LHR' || haystack.includes('heathrow') || /\blondon\b/.test(haystack)) {
    return 'lhr-london';
  }
  if (iata === 'HND' || haystack.includes('haneda') || /\btokyo\b/.test(haystack)) {
    return 'hnd-tokyo';
  }
  if (
    iata === 'BKK' ||
    haystack.includes('suvarnabhumi') ||
    /\bbangkok\b/.test(haystack)
  ) {
    return 'bkk-bangkok';
  }
  return null;
}

export function buildBestEffortOptions(plan: TripPlan): RouteOption[] {
  const airportLabel = plan.airport.name || plan.airport.iata || 'the airport';
  const hotelLabel = plan.hotel.name || plan.hotel.address || 'your hotel';

  return [
    {
      id: 'best-effort-public',
      mode: 'public',
      title: 'Airport Public Transit',
      steps: [
        `Follow airport rail, metro, or express bus signs inside ${airportLabel} Arrivals.`,
        `Check the official ticket desk for the stop closest to ${hotelLabel}.`,
      ],
      stops: [airportLabel, hotelLabel],
      durationMin: null,
      price: null,
      transfers: null,
      walkMinutes: null,
      hiddenFees: null,
      insuranceIncluded: null,
      scamWarning: null,
      backup: [`If public transit is not running, use the official taxi rank outside ${airportLabel} Arrivals.`],
    },
    {
      id: 'best-effort-taxi',
      mode: 'taxi',
      title: 'Official Airport Taxi Rank',
      steps: [
        `Walk outside ${airportLabel} Arrivals to the official signed taxi rank.`,
        `Show the driver ${hotelLabel} and confirm whether a meter or official zone fare applies.`,
      ],
      stops: [`${airportLabel} Taxi Rank`, hotelLabel],
      durationMin: null,
      price: null,
      transfers: 0,
      walkMinutes: null,
      hiddenFees: null,
      insuranceIncluded: null,
      scamWarning: 'Avoid anyone soliciting rides inside the arrivals hall; board only at the official signed taxi queue.',
      backup: [`Ask the ${airportLabel} information desk for the official airport shuttle or rail desk.`],
    },
    {
      id: 'best-effort-rental',
      mode: 'rental',
      title: 'Airport Car Rental Desk',
      steps: [
        `Visit the licensed car rental counters in ${airportLabel} Arrivals.`,
        `Confirm local parking availability at ${hotelLabel} and total insurance coverage before signing.`,
      ],
      stops: [`${airportLabel} Rental Desk`, hotelLabel],
      durationMin: null,
      price: null,
      transfers: null,
      walkMinutes: null,
      hiddenFees: null,
      insuranceIncluded: null,
      scamWarning: 'Check fuel policy, deposit hold, and existing scratches before driving off the airport lot.',
      backup: [`Use the official taxi rank if ${hotelLabel} does not offer guest parking.`],
    },
  ];
}

export function buildRoutesForPlan(basePlan: TripPlan): TripPlan {
  const matched = matchVerifiedRoute(basePlan);
  if (matched) {
    const cfg = VERIFIED_ROUTES[matched];
    return {
      ...basePlan,
      airport: {
        ...basePlan.airport,
        iata: basePlan.airport.iata || cfg.airportIata,
        name: basePlan.airport.name || cfg.airportName,
        country: basePlan.airport.country || cfg.airportCountry,
      },
      options: cfg.options.map((o) => ({
        ...o,
        steps: [...o.steps],
        stops: [...o.stops],
        backup: [...o.backup],
        hiddenFees: o.hiddenFees ? [...o.hiddenFees] : null,
      })),
      verifiedRoute: true,
    };
  }

  return {
    ...basePlan,
    options: buildBestEffortOptions(basePlan),
    verifiedRoute: false,
  };
}

export function buildSampleHeathrowPlan(): TripPlan {
  const now = new Date();
  const landingISO = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const expiresAt = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const cfg = VERIFIED_ROUTES['lhr-london'];

  return {
    id: `sample-lhr-${Date.now()}`,
    createdAt: now.toISOString(),
    lastUpdated: now.toISOString(),
    expiresAt,
    flight: {
      number: 'BA 106',
      landingLocalISO: landingISO,
    },
    airport: {
      iata: cfg.airportIata,
      name: cfg.airportName,
      country: cfg.airportCountry,
      lat: null,
      lon: null,
    },
    altAirports: [],
    hotel: {
      name: 'The Sanctuary House Hotel (Example)',
      address: '33 Tothill Street, Westminster, London SW1H 9LA',
      addressLocal: null,
      localLang: null,
      phone: null,
      entranceNote: 'Corner of Tothill Street near St James’s Park station',
      receptionNote: '24-hour front desk',
      lateArrivalPolicy: null,
      cancellationPolicy: null,
      lat: null,
      lon: null,
    },
    options: cfg.options.map((o) => ({
      ...o,
      steps: [...o.steps],
      stops: [...o.stops],
      backup: [...o.backup],
      hiddenFees: o.hiddenFees ? [...o.hiddenFees] : null,
    })),
    verifiedRoute: true,
    isSample: true,
  };
}
