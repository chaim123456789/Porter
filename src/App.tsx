import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineId, NanoStatus, RouteOption, TripPlan } from './types';
import { getLastFirebaseError, isFirebaseConfigured } from './firebase';
import {
  clearPlan,
  loadPickedRouteId,
  loadPlan,
  replacePlan,
  savePickedRouteId,
  savePlan,
} from './store';
import {
  initializeNanoOnDevice,
  isLikelyTouchPhone,
  probeNanoAvailability,
} from './engine/firebaseEngine';
import { validateTripPlan } from './engine/validate';
import { buildRoutesForPlan, buildSampleHeathrowPlan } from './data/verifiedRoutes';
import { checkSingleOptionPrice, refreshPlanWithOfficialFares } from './lib/fares';
import { useOnlineStatus } from './lib/pwa';
import type { SupportedLanguage } from './lib/translate';
import { Header } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { SetupScreen, type ExtractionDraft } from './components/SetupScreen';
import { ConfirmCard } from './components/ConfirmCard';
import { TripWorkspace } from './components/TripWorkspace';

const NINETY_MINUTES_MS = 90 * 60 * 1000;
const SIXTY_MINUTES_MS = 60 * 60 * 1000;
const QUIET_HOURS_KEY = 'porter_quiet_hours_v1';

export default function App() {
  const isOnline = useOnlineStatus();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [pickedRouteId, setPickedRouteId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [autoStartVoice, setAutoStartVoice] = useState(false);

  const [isCheckingFares, setIsCheckingFares] = useState(false);
  const [checkingOptionId, setCheckingOptionId] = useState<string | null>(null);
  const [fareNotice, setFareNotice] = useState<string | null>(null);

  const [language, setLanguage] = useState<SupportedLanguage>('English');
  const [quietHours, setQuietHours] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(QUIET_HOURS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [trainCancelled, setTrainCancelled] = useState(false);
  const [testTriggerCounter, setTestTriggerCounter] = useState(0);

  const [nanoStatus, setNanoStatus] = useState<NanoStatus>('checking');
  const [isSettingUpNano, setIsSettingUpNano] = useState(false);
  const [nanoProgress, setNanoProgress] = useState<number | null>(null);
  const [nanoError, setNanoError] = useState<string | null>(null);
  const [isTouchPhone, setIsTouchPhone] = useState(false);

  // Engine badge starts hidden (null); set only when an engine produces a user-visible answer.
  const [activeEngine, setActiveEngine] = useState<EngineId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshInFlightRef = useRef(false);
  const nanoPollTimerRef = useRef<number | null>(null);

  const stopNanoPoll = useCallback(() => {
    if (nanoPollTimerRef.current !== null) {
      window.clearInterval(nanoPollTimerRef.current);
      nanoPollTimerRef.current = null;
    }
  }, []);

  const refreshNanoAvailability = useCallback(async () => {
    const touchPhone = isLikelyTouchPhone();
    setIsTouchPhone(touchPhone);
    if (touchPhone || !isFirebaseConfigured) {
      setNanoStatus('not ready');
      return;
    }
    const status = await probeNanoAvailability();
    setNanoStatus(status);
    if (status === 'ready') {
      setIsSettingUpNano(false);
      stopNanoPoll();
    }
  }, [stopNanoPoll]);

  const runFareRefresh = useCallback(async (targetPlan: TripPlan) => {
    if (refreshInFlightRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!isFirebaseConfigured) return;
    if (!targetPlan.verifiedRoute) return;

    refreshInFlightRef.current = true;
    setIsCheckingFares(true);
    setFareNotice(null);

    try {
      const result = await refreshPlanWithOfficialFares(targetPlan);
      if (result.plan) {
        const swapped = await replacePlan(() => result.plan!);
        setPlan(swapped);
      } else if (result.validationFailed) {
        setFareNotice("Plan couldn't be verified. Please check prices at the counter.");
      }
    } catch {
      // Keep old plan untouched
    } finally {
      refreshInFlightRef.current = false;
      setIsCheckingFares(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadPlan().then(async (saved) => {
      if (!active) return;
      if (saved) {
        let readyPlan = saved;
        if (!saved.options || saved.options.length === 0) {
          const built = buildRoutesForPlan(saved);
          if (validateTripPlan(built).valid) {
            readyPlan = await savePlan(built);
          }
        }
        setPlan(readyPlan);
        setPickedRouteId(loadPickedRouteId(readyPlan.id));

        const hasMissingVerifiedFares =
          readyPlan.verifiedRoute && readyPlan.options.some((o) => o.price === null);
        const ageMs = Date.now() - Date.parse(readyPlan.lastUpdated);
        if (
          navigator.onLine &&
          isFirebaseConfigured &&
          (hasMissingVerifiedFares || (!Number.isNaN(ageMs) && ageMs > SIXTY_MINUTES_MS))
        ) {
          void runFareRefresh(readyPlan);
        }
      }
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [runFareRefresh]);

  // Tiny probe through Firebase AI Logic at launch and on window focus
  useEffect(() => {
    void refreshNanoAvailability();
    const handleFocus = () => {
      void refreshNanoAvailability();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      stopNanoPoll();
    };
  }, [refreshNanoAvailability, stopNanoPoll]);

  // Scheduled refresh: every 90 min while online, plus when returning online or visible after > 60 min
  useEffect(() => {
    if (!plan) return;

    const maybeRefreshIfStale = () => {
      if (!navigator.onLine || !isFirebaseConfigured || document.visibilityState !== 'visible') {
        return;
      }
      const lastMs = Date.parse(plan.lastUpdated);
      if (Number.isNaN(lastMs)) return;
      if (Date.now() - lastMs > SIXTY_MINUTES_MS) {
        void runFareRefresh(plan);
      }
    };

    const intervalId = window.setInterval(() => {
      if (navigator.onLine && isFirebaseConfigured) {
        void runFareRefresh(plan);
      }
    }, NINETY_MINUTES_MS);

    window.addEventListener('online', maybeRefreshIfStale);
    document.addEventListener('visibilitychange', maybeRefreshIfStale);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', maybeRefreshIfStale);
      document.removeEventListener('visibilitychange', maybeRefreshIfStale);
    };
  }, [plan, runFareRefresh]);

  const handleStartNanoSetup = async () => {
    setNanoError(null);
    setNanoProgress(null);
    setIsSettingUpNano(true);
    stopNanoPoll();

    // Re-probe every 5 seconds until ready if progress callbacks are absent or setup takes time
    nanoPollTimerRef.current = window.setInterval(() => {
      void probeNanoAvailability().then((status) => {
        if (status === 'ready') {
          setNanoStatus('ready');
          setIsSettingUpNano(false);
          stopNanoPoll();
        }
      });
    }, 5000);

    try {
      const status = await initializeNanoOnDevice((loaded) => {
        setNanoProgress(loaded);
      });
      if (status === 'ready') {
        setNanoStatus('ready');
        setIsSettingUpNano(false);
        stopNanoPoll();
      }
    } catch (err) {
      stopNanoPoll();
      setIsSettingUpNano(false);
      setNanoProgress(null);
      setNanoError(
        err instanceof Error
          ? err.message
          : 'Could not set up Nano on this device right now.'
      );
      await refreshNanoAvailability();
    }
  };

  const handleConfirmPlan = async (confirmedPlan: TripPlan) => {
    setFareNotice(null);
    setTrainCancelled(false);
    const built = buildRoutesForPlan(confirmedPlan);
    const validation = validateTripPlan(built);
    if (!validation.valid) {
      setFareNotice("Plan couldn't be verified. Please check prices at the counter.");
      return;
    }

    const saved = await savePlan(built);
    setPlan(saved);
    setPickedRouteId(null);
    setDraft(null);
    setActiveEngine(null);

    if (isOnline && isFirebaseConfigured && saved.verifiedRoute) {
      void runFareRefresh(saved);
    }
  };

  const handleLoadExample = async () => {
    setFareNotice(null);
    setTrainCancelled(false);
    const sample = buildSampleHeathrowPlan();
    const validation = validateTripPlan(sample);
    if (!validation.valid) {
      setFareNotice("Plan couldn't be verified. Please check prices at the counter.");
      return;
    }

    const saved = await savePlan(sample);
    setPlan(saved);
    setPickedRouteId(null);
    setDraft(null);
    setActiveEngine(null);

    if (isOnline && isFirebaseConfigured) {
      void runFareRefresh(saved);
    }
  };

  const handlePickRoute = (option: RouteOption) => {
    if (!plan) return;
    setPickedRouteId(option.id);
    savePickedRouteId(plan.id, option.id);
  };

  const handleCheckPrices = async (option: RouteOption) => {
    if (!plan) return;
    setFareNotice(null);
    setCheckingOptionId(option.id);
    try {
      const result = await checkSingleOptionPrice(plan, option.id);
      if (result.plan) {
        const swapped = await replacePlan(() => result.plan!);
        setPlan(swapped);
      } else if (result.error) {
        setFareNotice(result.error);
      }
    } finally {
      setCheckingOptionId(null);
    }
  };

  const handleUpdateHotelAddress = async (newAddress: string): Promise<TripPlan> => {
    if (!plan) {
      throw new Error('No active trip plan.');
    }
    const updatedBase: TripPlan = {
      ...plan,
      lastUpdated: new Date().toISOString(),
      hotel: {
        ...plan.hotel,
        name: newAddress,
        address: newAddress,
      },
    };
    if (validateTripPlan(updatedBase).valid) {
      const swapped = await replacePlan(() => updatedBase);
      setPlan(swapped);
      return swapped;
    }
    return plan;
  };

  const handleToggleQuietHours = () => {
    setQuietHours((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(QUIET_HOURS_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const handleTestCancelledTrain = () => {
    if (!plan) return;
    setTrainCancelled(true);
    const pickedOpt = pickedRouteId
      ? plan.options.find((o) => o.id === pickedRouteId)
      : null;
    if (pickedOpt && pickedOpt.mode === 'public') {
      setPickedRouteId(null);
      savePickedRouteId(plan.id, null);
    }
    setTestTriggerCounter((c) => c + 1);
  };

  const handleClearPlan = async () => {
    if (plan) {
      savePickedRouteId(plan.id, null);
    }
    await clearPlan();

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {
        // Ignore service worker cleanup errors
      }
    }

    setPlan(null);
    setPickedRouteId(null);
    setDraft(null);
    setFareNotice(null);
    setTrainCancelled(false);
    setActiveEngine(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        isOnline={isOnline}
        isFirebaseConfigured={isFirebaseConfigured}
        lastUpdated={plan?.lastUpdated ?? null}
        activeEngine={activeEngine}
        nanoStatus={nanoStatus}
        isSettingUpNano={isSettingUpNano}
        nanoProgress={nanoProgress}
        nanoError={nanoError}
        isTouchPhone={isTouchPhone}
        quietHours={quietHours}
        onStartNanoSetup={() => void handleStartNanoSetup()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1">
        {!isLoaded ? (
          <div className="mx-auto max-w-[480px] px-4 py-12 text-center text-sm text-slate-500">
            Loading Porter…
          </div>
        ) : plan ? (
          <TripWorkspace
            plan={plan}
            isOnline={isOnline}
            pickedRouteId={pickedRouteId}
            isCheckingFares={isCheckingFares}
            checkingOptionId={checkingOptionId}
            fareNotice={fareNotice}
            language={language}
            quietHours={quietHours}
            trainCancelled={trainCancelled}
            testTriggerCounter={testTriggerCounter}
            onRestoreTrain={() => setTrainCancelled(false)}
            onUpdateHotelAddress={handleUpdateHotelAddress}
            onPickRoute={handlePickRoute}
            onCheckPrices={(opt) => void handleCheckPrices(opt)}
            onEngineChange={(engine) => {
              setActiveEngine(engine);
            }}
          />
        ) : draft ? (
          <ConfirmCard
            draft={draft}
            onConfirm={(confirmed) => void handleConfirmPlan(confirmed)}
            onRetryVoice={() => {
              setDraft(null);
              setActiveEngine(null);
              setAutoStartVoice(true);
            }}
            onCancel={() => {
              setDraft(null);
              setActiveEngine(null);
            }}
          />
        ) : (
          <SetupScreen
            isOnline={isOnline}
            autoStartVoice={autoStartVoice}
            onAutoVoiceHandled={() => setAutoStartVoice(false)}
            onExtracted={(nextDraft) => {
              setDraft(nextDraft);
              setActiveEngine('cloud');
            }}
            onLoadExample={() => void handleLoadExample()}
          />
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        nanoStatus={nanoStatus}
        isTouchPhone={isTouchPhone}
        isFirebaseConfigured={isFirebaseConfigured}
        activeEngine={activeEngine}
        lastFirebaseError={getLastFirebaseError()}
        plan={plan}
        language={language}
        onChangeLanguage={setLanguage}
        quietHours={quietHours}
        onToggleQuietHours={handleToggleQuietHours}
        onTestCancelledTrain={handleTestCancelledTrain}
        onClearPlan={() => void handleClearPlan()}
      />
    </div>
  );
}
