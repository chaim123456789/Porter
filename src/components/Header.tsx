import React from 'react';
import { AlertCircle, Check, Settings, Smartphone, Wifi, WifiOff } from 'lucide-react';
import type { EngineId, NanoStatus } from '../types';
import { formatUpdatedAge } from '../lib/pwa';
import { EngineBadge } from './EngineBadge';

interface HeaderProps {
  isOnline: boolean;
  isFirebaseConfigured: boolean;
  lastUpdated: string | null;
  activeEngine: EngineId | null;
  nanoStatus: NanoStatus;
  isSettingUpNano: boolean;
  nanoProgress: number | null;
  nanoError: string | null;
  isTouchPhone: boolean;
  quietHours?: boolean;
  onStartNanoSetup: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isOnline,
  isFirebaseConfigured,
  lastUpdated,
  activeEngine,
  nanoStatus,
  isSettingUpNano,
  nanoProgress,
  nanoError,
  isTouchPhone,
  quietHours = false,
  onStartNanoSetup,
  onOpenSettings,
}) => {
  const updatedText = formatUpdatedAge(lastUpdated);
  const offlineLabel = updatedText ? `Offline · ${updatedText}` : 'Offline';
  const hasRealProgress =
    typeof nanoProgress === 'number' && Number.isFinite(nanoProgress) && nanoProgress > 0;
  const progressPercent = hasRealProgress ? Math.round(nanoProgress * 100) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F766E] text-white"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" strokeLinecap="round" />
              <rect x="5" y="6" width="14" height="13" rx="2.5" fill="currentColor" stroke="none" />
              <path d="M8 19v1.5M16 19v1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Porter
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
              isOnline
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate max-w-[190px] sm:max-w-none">
              {isOnline ? 'Online · Live' : offlineLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open Porter settings"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Firebase environment setup banner when env config is missing */}
      {!isFirebaseConfigured && !quietHours && (
        <div className="border-t border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-[960px] items-center gap-2 px-4 py-2 text-xs font-medium text-amber-950 sm:px-6">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <span>
              Porter isn&apos;t configured yet. Add the Firebase settings in your environment.
            </span>
          </div>
        </div>
      )}

      {/* Engine badge row: hidden until an engine produces a user-visible answer */}
      {activeEngine !== null && (
        <div className="border-t border-slate-100 bg-slate-50/80">
          <div className="mx-auto flex max-w-[960px] items-center px-4 py-1.5 sm:px-6">
            <EngineBadge engine={activeEngine} />
          </div>
        </div>
      )}

      {/* Desktop Nano availability setup card via Firebase AI Logic */}
      {!quietHours &&
        isFirebaseConfigured &&
        !isTouchPhone &&
        (isSettingUpNano || (nanoStatus === 'not ready' && isOnline)) && (
          <div className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-[960px] px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900">Work offline with Nano</p>
                  <p className="text-xs text-slate-600">
                    Nano runs on this computer through Firebase AI Logic, so Porter can re-plan your trip without internet.
                  </p>
                  {nanoError && (
                    <p className="pt-1 text-xs font-medium text-red-700" role="alert">
                      {nanoError}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:items-end shrink-0">
                  <button
                    type="button"
                    onClick={onStartNanoSetup}
                    disabled={isSettingUpNano}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-75 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
                  >
                    {isSettingUpNano
                      ? progressPercent !== null
                        ? `Getting Nano… ${progressPercent}%`
                        : 'Getting Nano…'
                      : 'Get Nano for offline'}
                  </button>

                  {isSettingUpNano && progressPercent !== null && (
                    <div className="w-full sm:w-48 space-y-1">
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-valuenow={progressPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Nano setup progress"
                      >
                        <div
                          className="h-full bg-[#0F766E] transition-all duration-150"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-right text-[11px] font-medium text-slate-600 tabular-nums">
                        {progressPercent}%
                      </p>
                    </div>
                  )}

                  {isSettingUpNano && progressPercent === null && (
                    <div className="w-full sm:w-48">
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-label="Getting Nano for offline"
                      >
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-[#0F766E]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {nanoStatus === 'ready' && !isTouchPhone && (
        <div className="border-t border-slate-100 bg-white">
          <div className="mx-auto flex max-w-[960px] items-center px-4 py-1.5 sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Nano ready
            </span>
          </div>
        </div>
      )}

      {(isTouchPhone || (!isTouchPhone && !isOnline && nanoStatus !== 'ready')) && (
        <div className="border-t border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-[960px] items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-amber-900 sm:px-6">
            <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Offline mode — Nano on desktop</span>
          </div>
        </div>
      )}
    </header>
  );
};
