import React from 'react';
import { AlertTriangle, Check, ExternalLink, Info, RefreshCw } from 'lucide-react';
import type { Mode, Price, RouteOption, TripPlan } from '../types';
import { formatUpdatedAge } from '../lib/pwa';
import { formatDuration } from '../engine/validate';

interface ComparePanelProps {
  plan: TripPlan;
  isOnline: boolean;
  pickedRouteId: string | null;
  isCheckingFares: boolean;
  checkingOptionId: string | null;
  fareNotice: string | null;
  quietHours: boolean;
  trainCancelled: boolean;
  translatedTitles: Record<string, string>;
  onRestoreTrain: () => void;
  onPickOption: (option: RouteOption) => void;
  onTellMeMore: (option: RouteOption) => void;
  onCheckPrices: (option: RouteOption) => void;
}

function formatModeLabel(mode: Mode): string {
  switch (mode) {
    case 'public':
      return 'Public transit';
    case 'taxi':
      return 'Official taxi';
    case 'rental':
      return 'Car rental';
  }
}

function formatComparePrice(price: NonNullable<Price>): string {
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2));
  const range = price.min === price.max ? fmt(price.min) : `${fmt(price.min)}–${fmt(price.max)}`;
  return `${range} ${price.currency}`;
}

function extractHostname(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const ComparePanel: React.FC<ComparePanelProps> = ({
  plan,
  isOnline,
  pickedRouteId,
  isCheckingFares,
  checkingOptionId,
  fareNotice,
  quietHours,
  trainCancelled,
  translatedTitles,
  onRestoreTrain,
  onPickOption,
  onTellMeMore,
  onCheckPrices,
}) => {
  const updatedLabel = formatUpdatedAge(plan.lastUpdated) ?? 'Updated 0m ago';
  const visibleOptions = trainCancelled
    ? plan.options.filter((opt) => opt.mode !== 'public')
    : plan.options;

  return (
    <section aria-label="Compare routes" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Compare routes</h2>
          <p className="text-xs text-slate-500">
            Single source of truth · <span className="tabular-nums">{updatedLabel}</span>
          </p>
        </div>
        {!plan.verifiedRoute && (
          <span className="text-xs font-medium text-amber-800">
            Unverified — check price at counter
          </span>
        )}
      </div>

      {!quietHours && plan.isSample && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-2.5 text-xs text-teal-950"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
          <p>
            <strong>Example trip:</strong> London Heathrow (LHR) to Central London. Set up your own flight or hotel anytime from Settings.
          </p>
        </div>
      )}

      {trainCancelled && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950"
        >
          <span className="font-semibold">Scenario active: Train cancelled</span>
          <button
            type="button"
            onClick={onRestoreTrain}
            className="font-semibold text-[#0F766E] underline hover:text-teal-800"
          >
            Restore train option
          </button>
        </div>
      )}

      {!quietHours && fareNotice && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-950"
        >
          {fareNotice}
        </div>
      )}

      <div className="space-y-3">
        {visibleOptions.map((option) => {
          const isPicked = pickedRouteId === option.id;
          const isCheckingThis = isCheckingFares || checkingOptionId === option.id;
          const priceHost = extractHostname(option.price?.source);
          const displayTitle = translatedTitles[option.id] ?? option.title;

          return (
            <article
              key={option.id}
              className={`rounded-2xl bg-white p-4 transition-colors ${
                isPicked
                  ? 'border-2 border-[#0F766E] shadow-xs'
                  : 'border border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    {formatModeLabel(option.mode)}
                  </p>
                  <h3 className="mt-0.5 text-base font-bold text-slate-900">
                    {displayTitle}
                  </h3>
                </div>
                {isPicked && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-[#0F766E] shrink-0">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Picked
                  </span>
                )}
              </div>

              {/* Price & Duration summary */}
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                {option.price ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-bold text-slate-900 tabular-nums">
                      {formatComparePrice(option.price)}
                    </p>
                    <p className="text-xs font-medium text-slate-600 tabular-nums">
                      {formatDuration(option.durationMin)}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        {isCheckingThis
                          ? 'Unverified — checking…'
                          : 'Unverified — check price at counter'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                        {formatDuration(option.durationMin)}
                      </p>
                    </div>
                    {!isCheckingThis && (
                      <button
                        type="button"
                        onClick={() => onCheckPrices(option)}
                        disabled={!isOnline}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        <span>{isOnline ? 'Check prices' : 'Needs connection'}</span>
                      </button>
                    )}
                  </div>
                )}

                {option.price && (priceHost || option.price.verifiedOn) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>
                      {option.price.status === 'verified' ? 'Official fare' : 'Operator fare'}
                    </span>
                    {option.price.source && priceHost && (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={option.price.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#0F766E] underline hover:text-teal-800"
                        >
                          <span>{priceHost}</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </>
                    )}
                    {option.price.verifiedOn && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{option.price.verifiedOn}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Structured route details */}
              <dl className="mt-3 divide-y divide-slate-100 text-xs">
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-medium text-slate-500 shrink-0">Transfers</dt>
                  <dd className="text-right font-medium text-slate-800 tabular-nums">
                    {option.transfers !== null ? option.transfers : 'Unknown'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-medium text-slate-500 shrink-0">Hidden fees</dt>
                  <dd className="text-right text-slate-700">
                    {option.hiddenFees && option.hiddenFees.length > 0
                      ? option.hiddenFees.join('; ')
                      : 'Unknown'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-medium text-slate-500 shrink-0">Insurance</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {option.insuranceIncluded === true
                      ? 'Included'
                      : option.insuranceIncluded === false
                        ? 'Not included'
                        : 'Unknown'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-medium text-slate-500 shrink-0">Backup</dt>
                  <dd className="text-right text-slate-700">
                    {option.backup.length > 0 ? option.backup[0] : 'Unknown'}
                  </dd>
                </div>
              </dl>

              {option.scamWarning && (
                <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                  <p>{option.scamWarning}</p>
                </div>
              )}

              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onTellMeMore(option)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
                >
                  Tell me more
                </button>
                <button
                  type="button"
                  onClick={() => onPickOption(option)}
                  aria-pressed={isPicked}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] ${
                    isPicked
                      ? 'border border-[#0F766E] bg-teal-50 text-[#0F766E]'
                      : 'bg-[#0F766E] text-white hover:bg-teal-800'
                  }`}
                >
                  {isPicked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{isPicked ? 'Picked' : 'Pick this one'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
