import React, { useState } from 'react';
import { BellOff, Bug, FlaskConical, Globe, Info, Trash2, X } from 'lucide-react';
import type { EngineId, NanoStatus, TripPlan } from '../types';
import { usePWAInstall } from '../lib/pwa';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../lib/translate';
import { runRoutedQuestion } from '../engine/router';
import { getEngineBadgeText } from './EngineBadge';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  nanoStatus: NanoStatus;
  isTouchPhone: boolean;
  isFirebaseConfigured: boolean;
  activeEngine: EngineId | null;
  lastFirebaseError: string | null;
  plan: TripPlan | null;
  language: SupportedLanguage;
  onChangeLanguage: (lang: SupportedLanguage) => void;
  quietHours: boolean;
  onToggleQuietHours: () => void;
  onTestCancelledTrain: () => void;
  onClearPlan: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  nanoStatus,
  isTouchPhone,
  isFirebaseConfigured,
  activeEngine,
  lastFirebaseError,
  plan,
  language,
  onChangeLanguage,
  quietHours,
  onToggleQuietHours,
  onTestCancelledTrain,
  onClearPlan,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [offlineTestRunning, setOfflineTestRunning] = useState(false);
  const [offlineTestReport, setOfflineTestReport] = useState<string | null>(null);

  if (!open) return null;

  const hasPlan = Boolean(plan);
  const nanoLine = isTouchPhone
    ? 'Offline mode — Nano on desktop'
    : nanoStatus === 'ready'
      ? getEngineBadgeText('nano')
      : nanoStatus === 'checking'
        ? 'Checking on-device Nano via Firebase AI Logic…'
        : 'Offline mode — Nano on desktop';

  const handleRunFirebaseOfflineTest = async () => {
    if (!plan) return;
    setOfflineTestRunning(true);
    setOfflineTestReport(null);

    let networkCalls = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (...args: Parameters<typeof fetch>) => {
      networkCalls += 1;
      return originalFetch(...args);
    }) as typeof fetch;

    try {
      const result = await runRoutedQuestion(
        'What is the fastest way from the airport to my hotel?',
        plan,
        {
          engineOverride: 'nano',
          event: 'offline_test',
        }
      );
      setOfflineTestReport(
        `Engine: ${getEngineBadgeText(result.engine)} · Network requests: ${networkCalls}`
      );
    } finally {
      window.fetch = originalFetch;
      setOfflineTestRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl">
        <div
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300"
          aria-hidden="true"
        />

        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 id="settings-title" className="text-base font-bold text-slate-900">
            Porter settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-slate-700">
          {/* Language selector */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <label
              htmlFor="settings-language"
              className="flex items-center gap-2 font-semibold text-slate-900"
            >
              <Globe className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              <span>Language</span>
            </label>
            <select
              id="settings-language"
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as SupportedLanguage)}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Translates the answer card and route titles. Numbers, prices, phones, and addresses stay unchanged.
            </p>
          </div>

          {/* Quiet hours toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="space-y-0.5">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <BellOff className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                <span>Quiet hours</span>
              </p>
              <p className="text-xs text-slate-600">
                No pop-ups or extra banners — only the answer card.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quietHours}
              aria-label="Quiet hours"
              onClick={onToggleQuietHours}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${
                quietHours ? 'bg-[#0F766E]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                  quietHours ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* #test panel */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">Disruption &amp; engine tests</p>
              <span className="font-mono text-xs text-slate-500">#test</span>
            </div>

            <button
              id="test"
              type="button"
              disabled={!hasPlan}
              onClick={() => {
                onTestCancelledTrain();
                onClose();
              }}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
            >
              <FlaskConical className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              <span>Test: cancelled train</span>
            </button>

            <button
              type="button"
              disabled={!hasPlan || offlineTestRunning}
              onClick={() => void handleRunFirebaseOfflineTest()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
            >
              <span>
                {offlineTestRunning
                  ? 'Running on-device test…'
                  : 'Test: Firebase AI on-device (0 network check)'}
              </span>
            </button>

            {offlineTestReport && (
              <p
                role="status"
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-950"
              >
                {offlineTestReport}
              </p>
            )}

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Repo rules</p>
              <p className="mt-0.5 leading-relaxed">
                Verify with search that all inference uses <code className="font-mono">firebase/ai</code> and <code className="font-mono">getAI</code> inside <code className="font-mono">src/engine/firebaseEngine.ts</code>, with zero direct model endpoints, zero browser AI globals, and zero API keys in the repo.
              </p>
            </div>

            {!hasPlan && (
              <p className="text-xs text-slate-500">
                Set up a trip or open the example first to run interactive tests.
              </p>
            )}
          </div>

          {/* Device AI status */}
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="font-semibold text-slate-900">On-device AI</p>
            <p className="text-slate-600">{nanoLine}</p>
            {isTouchPhone && (
              <p className="text-xs font-medium text-amber-800">
                AI re-planning on supported desktop Chrome
              </p>
            )}
          </div>

          {/* Limits section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <button
              type="button"
              onClick={() => setShowLimits((v) => !v)}
              aria-expanded={showLimits}
              className="flex min-h-[36px] w-full items-center justify-between text-left font-semibold text-slate-900"
            >
              <span className="inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                <span>Limits</span>
              </span>
              <span className="text-xs font-medium text-[#0F766E]">
                {showLimits ? 'Hide' : 'Show'}
              </span>
            </button>
            {showLimits && (
              <ul className="mt-2.5 space-y-1.5 border-t border-slate-200 pt-2.5 text-xs text-slate-600">
                <li>
                  <strong>{getEngineBadgeText('nano')}</strong>: runs offline on supported desktop Chrome.
                </li>
                <li>
                  <strong>{getEngineBadgeText('cloud')}</strong>: handles initial setup, grounded fares, and phone/desktop online answers when Nano is unavailable.
                </li>
                <li>
                  <strong>{getEngineBadgeText('template')}</strong>: always available offline with your saved trip plan and deterministic numbers.
                </li>
              </ul>
            )}
          </div>

          {/* #debug section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <button
              type="button"
              onClick={() => setShowDebug((v) => !v)}
              aria-expanded={showDebug}
              className="flex min-h-[36px] w-full items-center justify-between text-left font-semibold text-slate-900"
            >
              <span className="inline-flex items-center gap-2">
                <Bug className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                <span>#debug</span>
              </span>
              <span className="text-xs font-medium text-[#0F766E]">
                {showDebug ? 'Hide' : 'Show'}
              </span>
            </button>
            {showDebug && (
              <dl className="mt-2.5 space-y-1.5 border-t border-slate-200 pt-2.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Engine source</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {activeEngine ?? 'template'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Active badge</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {getEngineBadgeText(activeEngine ?? 'template')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Firebase AI Logic</dt>
                  <dd className="font-medium text-slate-800">
                    {isFirebaseConfigured ? 'Configured' : 'Not configured'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Nano status</dt>
                  <dd className="font-mono text-slate-800">{nanoStatus}</dd>
                </div>
                <div className="pt-1">
                  <dt className="text-slate-500">Last Firebase error</dt>
                  <dd className="mt-0.5 break-words font-mono text-[11px] text-slate-700">
                    {lastFirebaseError ?? 'None'}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="font-semibold text-slate-900">Voice input</p>
            <p className="mt-1 text-slate-600">
              Chrome&apos;s built-in speech recognition needs an internet connection.
            </p>
          </div>

          {!quietHours && !isInstalled && (isInstallable || isIOS) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-semibold text-slate-900">Add to home screen</p>
              <p className="mt-1 text-slate-600">
                Open Porter directly from your home screen or desktop, even offline.
              </p>
              {isInstallable ? (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Install Porter
                </button>
              ) : (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide((v) => !v)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    How to add on iPhone or iPad
                  </button>
                  {showIOSGuide && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      1. Tap the <strong>Share</strong> button in Safari.
                      <br />
                      2. Scroll down and tap <strong>Add to Home Screen</strong>.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {hasPlan && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  onClearPlan();
                  onClose();
                }}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Clear my trip</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
