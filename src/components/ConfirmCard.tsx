import React, { useState } from 'react';
import { AlertCircle, Check, Edit3, RotateCcw, Volume2 } from 'lucide-react';
import type { ExtractedBooking, TripPlan } from '../types';
import type { ExtractionDraft } from './SetupScreen';

interface ConfirmCardProps {
  draft: ExtractionDraft;
  onConfirm: (plan: TripPlan) => void;
  onRetryVoice: () => void;
  onCancel: () => void;
}

function normalizeField(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'not found') {
    return null;
  }
  return trimmed;
}

function formatLandingForInput(iso: string | null): string {
  if (!iso) return '';
  // Accept YYYY-MM-DDTHH:MM for datetime-local input if valid
  const match = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : iso;
}

function buildDraftPlan(
  values: ExtractedBooking,
  landingLocalISO: string | null,
  airport: { iata: string | null; name: string | null; country: string | null }
): TripPlan {
  const now = new Date().toISOString();
  let expiresAt: string | null = null;
  if (landingLocalISO) {
    const landingMs = Date.parse(landingLocalISO);
    if (!Number.isNaN(landingMs)) {
      expiresAt = new Date(landingMs + 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `trip-${Date.now()}`,
    createdAt: now,
    lastUpdated: now,
    expiresAt,
    flight: {
      number: values.flightNumber,
      landingLocalISO,
    },
    airport: {
      iata: airport.iata,
      name: airport.name,
      country: airport.country,
      lat: null,
      lon: null,
    },
    altAirports: [],
    hotel: {
      name: values.hotelName,
      address: values.hotelAddress,
      addressLocal: null,
      localLang: null,
      phone: values.hotelPhone,
      entranceNote: values.entranceNote,
      receptionNote: values.receptionNote,
      lateArrivalPolicy: values.lateArrivalPolicy,
      cancellationPolicy: values.cancellationPolicy,
      lat: null,
      lon: null,
    },
    options: [],
    verifiedRoute: false,
    isSample: false,
  };
}

const FIELD_META: Array<{ key: keyof ExtractedBooking; label: string }> = [
  { key: 'flightNumber', label: 'Flight number' },
  { key: 'flightDate', label: 'Flight date' },
  { key: 'hotelName', label: 'Hotel name' },
  { key: 'hotelAddress', label: 'Hotel address' },
  { key: 'hotelPhone', label: 'Hotel phone' },
  { key: 'lateArrivalPolicy', label: 'Late arrival policy' },
  { key: 'cancellationPolicy', label: 'Cancellation policy' },
  { key: 'receptionNote', label: 'Reception note' },
  { key: 'entranceNote', label: 'Entrance note' },
];

export const ConfirmCard: React.FC<ConfirmCardProps> = ({
  draft,
  onConfirm,
  onRetryVoice,
  onCancel,
}) => {
  const [isEditing, setIsEditing] = useState(draft.source !== 'voice');
  const [fields, setFields] = useState<ExtractedBooking>(draft.extracted);
  const [landingTime, setLandingTime] = useState<string>(
    formatLandingForInput(draft.flightLookup.landingLocalISO)
  );
  const [airportName, setAirportName] = useState<string>(draft.flightLookup.airportName ?? '');
  const [airportIata, setAirportIata] = useState<string>(draft.flightLookup.airportIata ?? '');

  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const needsManualLandingTime =
    Boolean(fields.flightNumber) && !draft.flightLookup.found;

  const handleReadBack = () => {
    if (!speechAvailable) return;
    window.speechSynthesis.cancel();
    const parts: string[] = [];
    if (fields.flightNumber) {
      parts.push(`Flight ${fields.flightNumber}.`);
    } else {
      parts.push('Flight not found.');
    }
    if (fields.hotelName) {
      parts.push(`Hotel ${fields.hotelName}.`);
    } else if (fields.hotelAddress) {
      parts.push(`Hotel at ${fields.hotelAddress}.`);
    } else {
      parts.push('Hotel not found.');
    }
    const utterance = new SpeechSynthesisUtterance(parts.join(' '));
    window.speechSynthesis.speak(utterance);
  };

  const handleConfirmSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const normalized: ExtractedBooking = {
      flightNumber: normalizeField(fields.flightNumber ?? ''),
      flightDate: normalizeField(fields.flightDate ?? ''),
      hotelName: normalizeField(fields.hotelName ?? ''),
      hotelAddress: normalizeField(fields.hotelAddress ?? ''),
      hotelPhone: normalizeField(fields.hotelPhone ?? ''),
      lateArrivalPolicy: normalizeField(fields.lateArrivalPolicy ?? ''),
      cancellationPolicy: normalizeField(fields.cancellationPolicy ?? ''),
      receptionNote: normalizeField(fields.receptionNote ?? ''),
      entranceNote: normalizeField(fields.entranceNote ?? ''),
    };
    const finalLanding = normalizeField(landingTime);
    const plan = buildDraftPlan(normalized, finalLanding, {
      iata: normalizeField(airportIata),
      name: normalizeField(airportName),
      country: draft.flightLookup.airportCountry,
    });
    onConfirm(plan);
  };

  if (draft.source === 'voice' && !isEditing) {
    return (
      <section className="mx-auto w-full max-w-[480px] px-4 py-8 sm:py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Did I hear this right?</h1>
              <p className="mt-1 text-sm text-slate-600">
                Check what Porter heard before saving your trip.
              </p>
            </div>
            {speechAvailable && (
              <button
                type="button"
                onClick={handleReadBack}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Volume2 className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                <span>Read it back</span>
              </button>
            )}
          </div>

          {draft.transcript && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800">
              <p className="text-xs font-semibold text-slate-500">What you said</p>
              <p className="mt-1 leading-relaxed">&ldquo;{draft.transcript}&rdquo;</p>
            </div>
          )}

          {needsManualLandingTime && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p>I couldn&apos;t confirm this flight. Tap Edit to enter your landing time.</p>
            </div>
          )}

          <dl className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
            {FIELD_META.map(({ key, label }) => {
              const val = fields[key];
              return (
                <div key={key} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="font-medium text-slate-600 shrink-0">{label}</dt>
                  <dd className={`text-right ${val ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                    {val ?? 'Not found'}
                  </dd>
                </div>
              );
            })}
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="font-medium text-slate-600 shrink-0">Landing time</dt>
              <dd className={`text-right tabular-nums ${landingTime ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                {landingTime || 'Not found'}
              </dd>
            </div>
          </dl>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleConfirmSubmit()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-3 text-base font-semibold text-white hover:bg-teal-800"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>Yes, that&apos;s right</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onRetryVoice}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Say it again</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span>Edit</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[480px] px-4 py-8 sm:py-10">
      <form
        onSubmit={handleConfirmSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Is this right?</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review or edit what Porter found. Missing items stay marked Not found.
            </p>
          </div>
          {speechAvailable && (
            <button
              type="button"
              onClick={handleReadBack}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              <span>Read it back</span>
            </button>
          )}
        </div>

        {needsManualLandingTime && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p>I couldn&apos;t confirm this flight. Enter your landing time.</p>
          </div>
        )}

        <div className="space-y-3.5">
          {(needsManualLandingTime || landingTime) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="confirm-landing-time" className="text-xs font-semibold text-slate-700">
                  Landing time
                </label>
                {!landingTime && <span className="text-xs text-slate-400">Not found</span>}
              </div>
              <input
                id="confirm-landing-time"
                type="datetime-local"
                value={landingTime}
                onChange={(e) => setLandingTime(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
              />
            </div>
          )}

          {(draft.flightLookup.airportName || draft.flightLookup.airportIata) && (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="confirm-airport-iata" className="text-xs font-semibold text-slate-700">
                  Airport code
                </label>
                <input
                  id="confirm-airport-iata"
                  type="text"
                  value={airportIata}
                  placeholder="Not found"
                  onChange={(e) => setAirportIata(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label htmlFor="confirm-airport-name" className="text-xs font-semibold text-slate-700">
                  Arrival airport
                </label>
                <input
                  id="confirm-airport-name"
                  type="text"
                  value={airportName}
                  placeholder="Not found"
                  onChange={(e) => setAirportName(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                />
              </div>
            </div>
          )}

          {FIELD_META.map(({ key, label }) => {
            const value = fields[key] ?? '';
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor={`confirm-${key}`} className="text-xs font-semibold text-slate-700">
                    {label}
                  </label>
                  {!value && <span className="text-xs text-slate-400">Not found</span>}
                </div>
                <input
                  id={`confirm-${key}`}
                  type="text"
                  value={value}
                  placeholder="Not found"
                  onChange={(e) =>
                    setFields((prev) => ({
                      ...prev,
                      [key]: e.target.value || null,
                    }))
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-3 text-base font-semibold text-white hover:bg-teal-800"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>Confirm</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Start over
          </button>
        </div>
      </form>
    </section>
  );
};
