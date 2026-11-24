import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Cloud,
  MapPin,
  Mic,
  Moon,
  Navigation,
  Send,
  Square,
} from 'lucide-react';
import type { EngineId, RouteOption, TripPlan } from '../types';
import { formatUpdatedAge } from '../lib/pwa';
import { startVoiceCapture, type VoiceController } from '../lib/voice';
import { translateAnswerAndTitles, type SupportedLanguage } from '../lib/translate';
import { runRoutedQuestion, type AnswerResult } from '../engine/router';
import { formatDuration, formatPrice } from '../engine/validate';
import { ComparePanel } from './ComparePanel';
import { EngineBadge } from './EngineBadge';

interface TripWorkspaceProps {
  plan: TripPlan;
  isOnline: boolean;
  pickedRouteId: string | null;
  isCheckingFares: boolean;
  checkingOptionId: string | null;
  fareNotice: string | null;
  language: SupportedLanguage;
  quietHours: boolean;
  trainCancelled: boolean;
  testTriggerCounter: number;
  onRestoreTrain: () => void;
  onUpdateHotelAddress: (newAddress: string) => Promise<TripPlan>;
  onPickRoute: (option: RouteOption) => void;
  onCheckPrices: (option: RouteOption) => void;
  onEngineChange: (engine: EngineId | null) => void;
}

const PINNED_CHIPS: Array<{ label: string; question: string }> = [
  {
    label: 'Cheapest',
    question: 'What is the cheapest way from the airport to my hotel?',
  },
  {
    label: 'Fastest',
    question: 'What is the fastest way from the airport to my hotel?',
  },
  {
    label: 'Safest at night',
    question: 'What is the safest way to get to my hotel at night?',
  },
  {
    label: 'With kids',
    question: 'What is the easiest way to get to my hotel with kids and a stroller?',
  },
];

export const TripWorkspace: React.FC<TripWorkspaceProps> = ({
  plan,
  isOnline,
  pickedRouteId,
  isCheckingFares,
  checkingOptionId,
  fareNotice,
  language,
  quietHours,
  trainCancelled,
  testTriggerCounter,
  onRestoreTrain,
  onUpdateHotelAddress,
  onPickRoute,
  onCheckPrices,
  onEngineChange,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'streaming' | 'done'>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [streamingEngine, setStreamingEngine] = useState<EngineId | null>(null);

  const [showHotelChangeForm, setShowHotelChangeForm] = useState(false);
  const [newHotelAddress, setNewHotelAddress] = useState('');

  const [translatedAnswer, setTranslatedAnswer] = useState<string | null>(null);
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({});
  const [translationUnavailable, setTranslationUnavailable] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const lastTestCounterRef = useRef(0);

  useEffect(() => {
    return () => {
      voiceRef.current?.stop();
    };
  }, []);

  const updatedLabel = formatUpdatedAge(plan.lastUpdated) ?? 'Updated 0m ago';
  const flightLabel = plan.flight.number ?? 'Flight not set';
  const hotelLabel = plan.hotel.name ?? plan.hotel.address ?? 'Hotel not set';

  const ask = async (
    rawQuestion: string,
    engineOverride?: EngineId,
    explicitPickedId?: string | null,
    overridePlan?: TripPlan,
    overrideTrainCancelled?: boolean,
    eventName?: string
  ) => {
    const clean = rawQuestion.trim();
    const activePlan = overridePlan ?? plan;
    const isTrainCancelled =
      overrideTrainCancelled !== undefined ? overrideTrainCancelled : trainCancelled;

    if (!clean) return;

    const effectivePickedId =
      explicitPickedId !== undefined ? explicitPickedId : pickedRouteId;

    setVoiceError(null);
    setAskedQuestion(clean);
    setQuestionInput('');
    setStreamingText('');
    setTranslatedAnswer(null);
    setTranslationUnavailable(false);
    setAnswerResult(null);
    setStreamingEngine(null);
    setPhase('thinking');

    const result = await runRoutedQuestion(clean, activePlan, {
      engineOverride,
      pickedRouteId: effectivePickedId,
      trainCancelled: isTrainCancelled,
      event: eventName,
      callbacks: {
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
        },
        onEngineResolved: (engine) => {
          setStreamingEngine(engine);
          onEngineChange(engine);
        },
        onChunk: (partial) => {
          setStreamingText(partial);
        },
      },
    });

    setAnswerResult(result);
    setStreamingText(result.answer);
    setStreamingEngine(result.engine);
    onEngineChange(result.engine);
    setPhase('done');
  };

  // Trigger re-plan immediately when "Test: cancelled train" (#test) is tapped
  useEffect(() => {
    if (testTriggerCounter > lastTestCounterRef.current) {
      lastTestCounterRef.current = testTriggerCounter;
      void ask(
        'The train is cancelled. Re-plan my trip using only the remaining options.',
        undefined,
        null,
        plan,
        true,
        'train_cancelled'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testTriggerCounter]);

  // Translate ONLY the answer card and Compare titles when language != English
  useEffect(() => {
    let active = true;

    if (language === 'English') {
      setTranslatedAnswer(null);
      setTranslatedTitles({});
      setTranslationUnavailable(false);
      return;
    }

    const sourceAnswer = phase === 'done' && answerResult ? answerResult.answer : null;
    translateAnswerAndTitles({
      targetLanguage: language,
      plan,
      answerText: sourceAnswer,
      isOnline,
    }).then((res) => {
      if (!active) return;
      setTranslatedAnswer(res.translatedAnswer);
      setTranslatedTitles(res.translatedTitles);
      setTranslationUnavailable(res.unavailable);
    });

    return () => {
      active = false;
    };
  }, [language, plan, phase, answerResult, isOnline]);

  const handlePickOption = (option: RouteOption) => {
    onPickRoute(option);
    void ask(
      `What is your recommendation for getting to my hotel now that I picked ${option.title}?`,
      undefined,
      option.id
    );
  };

  const handleTellMeMore = (option: RouteOption) => {
    void ask(`Tell me more about ${option.title} from the airport to my hotel.`);
  };

  const handleHotelChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newHotelAddress.trim();
    if (!trimmed) return;
    const updatedPlan = await onUpdateHotelAddress(trimmed);
    setShowHotelChangeForm(false);
    setNewHotelAddress('');
    await ask(
      `My hotel changed to ${trimmed}. Re-plan my route from the airport to my new hotel.`,
      undefined,
      pickedRouteId,
      updatedPlan,
      undefined,
      'hotel_changed'
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void ask(questionInput);
  };

  const handleMicToggle = () => {
    if (!isOnline) {
      setVoiceError('Needs a connection');
      return;
    }

    if (isRecording) {
      voiceRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setVoiceError(null);
    setIsRecording(true);
    voiceRef.current = startVoiceCapture({
      onTranscript: (spokenText) => {
        setQuestionInput(spokenText);
        void ask(spokenText);
      },
      onError: (msg) => {
        setVoiceError(msg);
      },
      onStop: () => {
        setIsRecording(false);
      },
    });
  };

  const visibleOptions = trainCancelled
    ? plan.options.filter((o) => o.mode !== 'public')
    : plan.options;

  const matchedRoute =
    answerResult?.routeId
      ? visibleOptions.find((opt) => opt.id === answerResult.routeId) ?? null
      : null;

  const pickedOption = pickedRouteId
    ? visibleOptions.find((opt) => opt.id === pickedRouteId) ?? null
    : null;

  const activeAnswerEngine = answerResult?.engine ?? streamingEngine ?? null;

  const displayedAnswerText =
    language !== 'English' && translatedAnswer
      ? translatedAnswer
      : streamingText;

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-6 md:max-w-[960px] md:px-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
        {/* Left column (top on mobile): Chat */}
        <section
          aria-label="Trip assistant"
          className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs"
        >
          <div className="border-b border-slate-100 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{plan.isSample ? 'Example saved on your device' : 'Saved on your device'}</span>
              <span className="tabular-nums">{updatedLabel}</span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
              {flightLabel} · {hotelLabel}
            </p>
            {pickedOption && (
              <p className="mt-1 text-xs font-medium text-[#0F766E]">
                Picked route: {translatedTitles[pickedOption.id] ?? pickedOption.title}
              </p>
            )}
          </div>

          {/* Three disruption quick-action cards at the top of the chat area */}
          <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={phase === 'thinking' || phase === 'streaming'}
                onClick={() =>
                  void ask(
                    'I missed my stop on the way to my hotel. What is the next safe stop and how do I get back?',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    'missed_stop'
                  )
                }
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
              >
                <Navigation className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
                <span>I missed my stop</span>
              </button>

              <button
                type="button"
                disabled={phase === 'thinking' || phase === 'streaming'}
                onClick={() => setShowHotelChangeForm((v) => !v)}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
              >
                <MapPin className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
                <span>My hotel changed</span>
              </button>

              <button
                type="button"
                disabled={phase === 'thinking' || phase === 'streaming'}
                onClick={() =>
                  void ask(
                    "It's 2am, what's safe? Give me the safest late-night option and a real action.",
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    'late_night_2am'
                  )
                }
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
              >
                <Moon className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
                <span>It&apos;s 2am, what&apos;s safe?</span>
              </button>
            </div>

            {showHotelChangeForm && (
              <form
                onSubmit={(e) => void handleHotelChangeSubmit(e)}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row"
              >
                <input
                  type="text"
                  value={newHotelAddress}
                  onChange={(e) => setNewHotelAddress(e.target.value)}
                  placeholder="Enter new hotel name or address"
                  aria-label="Enter new hotel name or address"
                  className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                />
                <button
                  type="submit"
                  disabled={!newHotelAddress.trim()}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  Re-plan
                </button>
              </form>
            )}
          </div>

          {/* Single answer card area */}
          <div className="min-h-[210px] flex-1 p-4">
            {phase === 'idle' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
                {pickedOption
                  ? `You picked ${translatedTitles[pickedOption.id] ?? pickedOption.title}. Ask Porter anything about getting to your hotel.`
                  : 'Your routes are ready to compare. Tap a quick question or ask Porter below.'}
              </div>
            ) : (
              <article
                aria-live="polite"
                className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                {askedQuestion && (
                  <p className="text-xs font-semibold text-slate-500">{askedQuestion}</p>
                )}

                {!quietHours && answerResult?.handoffNotice && (
                  <p role="status" className="text-xs font-medium text-slate-600">
                    {answerResult.handoffNotice}
                  </p>
                )}

                {!quietHours && answerResult?.aiUnavailable && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>AI unavailable — showing saved plan</span>
                  </div>
                )}

                {translationUnavailable && language !== 'English' && (
                  <p className="text-xs font-medium text-amber-800" role="status">
                    Translation unavailable
                  </p>
                )}

                {phase === 'thinking' ? (
                  <p className="text-sm font-medium text-slate-600">Thinking…</p>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-900">
                    {displayedAnswerText || 'Thinking…'}
                  </p>
                )}

                {matchedRoute && phase === 'done' && (
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs">
                    <p className="font-semibold text-slate-900">
                      {translatedTitles[matchedRoute.id] ?? matchedRoute.title}
                    </p>
                    <p className="mt-0.5 text-slate-600 tabular-nums">
                      {formatPrice(matchedRoute.price)} · {formatDuration(matchedRoute.durationMin)}
                    </p>
                  </div>
                )}

                {activeAnswerEngine && phase !== 'thinking' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2.5">
                    <EngineBadge engine={activeAnswerEngine} compact />

                    {isOnline && phase === 'done' && askedQuestion && (
                      <button
                        type="button"
                        onClick={() => void ask(askedQuestion, 'cloud')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
                      >
                        <Cloud className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        <span>Use cloud for this answer</span>
                      </button>
                    )}
                  </div>
                )}
              </article>
            )}
          </div>

          {/* Pinned quick-question chips + single question box */}
          <div className="space-y-2.5 border-t border-slate-100 p-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick questions">
              {PINNED_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={phase === 'thinking' || phase === 'streaming'}
                  onClick={() => void ask(chip.question)}
                  className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-[#0F766E] hover:bg-teal-50/50 hover:text-[#0F766E] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {voiceError && (
              <p className="text-xs font-medium text-amber-900" role="alert">
                {voiceError}
              </p>
            )}

            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Ask Porter anything about getting to your hotel"
                aria-label="Ask Porter anything about getting to your hotel"
                disabled={phase === 'thinking' || phase === 'streaming'}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 disabled:bg-slate-50"
              />

              <button
                type="button"
                onClick={handleMicToggle}
                disabled={!isOnline || phase === 'thinking' || phase === 'streaming'}
                aria-label={
                  !isOnline
                    ? 'Needs a connection'
                    : isRecording
                      ? 'Tap to stop recording'
                      : 'Speak your question'
                }
                title={!isOnline ? 'Needs a connection' : 'Speak it'}
                className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] ${
                  !isOnline
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : isRecording
                      ? 'border-red-300 bg-red-50 px-2.5 text-red-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isRecording ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full bg-red-600 animate-pulse"
                      aria-hidden="true"
                    />
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </>
                ) : (
                  <Mic className="h-4 w-4" aria-hidden="true" />
                )}
              </button>

              <button
                type="submit"
                disabled={
                  !questionInput.trim() || phase === 'thinking' || phase === 'streaming'
                }
                aria-label="Send question"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#0F766E] text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>

        {/* Right column (under chat on mobile): Compare */}
        <ComparePanel
          plan={plan}
          isOnline={isOnline}
          pickedRouteId={pickedRouteId}
          isCheckingFares={isCheckingFares}
          checkingOptionId={checkingOptionId}
          fareNotice={fareNotice}
          quietHours={quietHours}
          trainCancelled={trainCancelled}
          translatedTitles={translatedTitles}
          onRestoreTrain={onRestoreTrain}
          onPickOption={handlePickOption}
          onTellMeMore={handleTellMeMore}
          onCheckPrices={onCheckPrices}
        />
      </div>
    </main>
  );
};
