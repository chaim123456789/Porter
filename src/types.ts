export type Mode = 'public' | 'taxi' | 'rental';

export type Price = {
  min: number;
  max: number;
  currency: string;
  status: 'verified' | 'unverified';
  source?: string;
  verifiedOn?: string;
} | null;

export type RouteOption = {
  id: string;
  mode: Mode;
  title: string;
  steps: string[];
  stops: string[];
  durationMin: { min: number; max: number } | null;
  price: Price;
  transfers: number | null;
  walkMinutes: number | null;
  hiddenFees: string[] | null;
  insuranceIncluded: boolean | null;
  scamWarning: string | null;
  backup: string[];
};

export type AltAirport = {
  iata: string | null;
  name: string;
  distanceKm: number | null;
  note: string | null;
};

export type TripPlan = {
  id: string;
  createdAt: string;
  lastUpdated: string;
  expiresAt: string | null;
  flight: {
    number: string | null;
    landingLocalISO: string | null;
  };
  airport: {
    iata: string | null;
    name: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  };
  altAirports: AltAirport[];
  hotel: {
    name: string | null;
    address: string | null;
    addressLocal: string | null;
    localLang: string | null;
    phone: string | null;
    entranceNote: string | null;
    receptionNote: string | null;
    lateArrivalPolicy: string | null;
    cancellationPolicy: string | null;
    lat: number | null;
    lon: number | null;
  };
  options: RouteOption[];
  verifiedRoute: boolean;
  isSample: boolean;
};

export type EngineId = 'nano' | 'cloud' | 'template';

export type NanoStatus = 'checking' | 'ready' | 'not ready';

export type ReplanOutput = {
  recommendation: string;
  reason: string;
  steps: string[];
  fallback: string;
  unknowns: string[];
};

export interface ExtractedBooking {
  flightNumber: string | null;
  flightDate: string | null;
  hotelName: string | null;
  hotelAddress: string | null;
  hotelPhone: string | null;
  lateArrivalPolicy: string | null;
  cancellationPolicy: string | null;
  receptionNote: string | null;
  entranceNote: string | null;
}

export interface FlightLookupResult {
  found: boolean;
  airportIata: string | null;
  airportName: string | null;
  airportCountry: string | null;
  landingLocalISO: string | null;
}
