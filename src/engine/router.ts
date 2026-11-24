import { InferenceMode } from 'firebase/ai';
import { isFirebaseConfigured } from '../firebase';
import type { EngineId, ReplanOutput, TripPlan } from '../types';
import { runQuestion as runFirebaseQuestion } from './firebaseEngine';
import { formatReplanOutput, runTemplate } from './template';

export interface AnswerResult {
  answer: string;
  structured?: ReplanOutput;
  routeId: string | null;
  engine: EngineId;
  handoffNotice: string | null;
  aiUnavailable: boolean;
}

export interface RunQuestionCallbacks {
  onPhaseChange?: (phase: 'thinking' | 'streaming' | 'done') => void;
  onEngineResolved?: (engine: EngineId) => void;
  onChunk?: (partialText: string) => void;
}

async function streamTextChunks(
  fullText: string,
  onChunk?: (partialText: string) => void
): Promise<void> {
  if (!onChunk) return;
  const words = fullText.split(/(\s+)/);
  let built = '';
  const step = Math.max(1, Math.ceil(words.length / 18));
  for (let i = 0; i < words.length; i += step) {
    built += words.slice(i, i + step).join('');
    onChunk(built);
    if (i + step < words.length) {
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  }
}

export async function runRoutedQuestion(
  question: string,
  plan: TripPlan,
  options?: {
    engineOverride?: EngineId;
    callbacks?: RunQuestionCallbacks;
    pickedRouteId?: string | null;
    trainCancelled?: boolean;
    event?: string;
  }
): Promise<AnswerResult> {
  const cleanQuestion = question.trim();
  const callbacks = options?.callbacks;
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  callbacks?.onPhaseChange?.('thinking');

  const finishWithTemplate = async (aiUnavailable: boolean): Promise<AnswerResult> => {
    const tpl = runTemplate(
      cleanQuestion,
      plan,
      options?.pickedRouteId,
      options?.trainCancelled
    );
    callbacks?.onEngineResolved?.('template');
    callbacks?.onPhaseChange?.('streaming');
    await streamTextChunks(tpl.answer, callbacks?.onChunk);
    callbacks?.onPhaseChange?.('done');
    return {
      answer: tpl.answer,
      structured: tpl.structured,
      routeId: tpl.routeId,
      engine: 'template',
      handoffNotice: null,
      aiUnavailable,
    };
  };

  if (options?.engineOverride === 'template' || !isFirebaseConfigured) {
    return finishWithTemplate(false);
  }

  let mode: InferenceMode;
  if (!isOnline) {
    // Offline rule: ONLY_ON_DEVICE through Firebase AI Logic, never cloud
    mode = InferenceMode.ONLY_ON_DEVICE;
  } else if (options?.engineOverride === 'cloud') {
    mode = InferenceMode.ONLY_IN_CLOUD;
  } else if (options?.engineOverride === 'nano') {
    mode = InferenceMode.ONLY_ON_DEVICE;
  } else {
    mode = InferenceMode.PREFER_ON_DEVICE;
  }

  try {
    const fbResult = await runFirebaseQuestion(cleanQuestion, plan, options?.event, {
      pickedRouteId: options?.pickedRouteId,
      trainCancelled: options?.trainCancelled,
      mode,
    });

    const formatted = formatReplanOutput(fbResult.answer);
    const handoffNotice =
      fbResult.engine === 'cloud' && fbResult.cloudFallbackUsed
        ? "Nano wasn't available, so this answer used the cloud."
        : null;

    callbacks?.onEngineResolved?.(fbResult.engine);
    callbacks?.onPhaseChange?.('streaming');
    await streamTextChunks(formatted, callbacks?.onChunk);
    callbacks?.onPhaseChange?.('done');

    return {
      answer: formatted,
      structured: fbResult.answer,
      routeId: fbResult.routeId ?? null,
      engine: fbResult.engine,
      handoffNotice,
      aiUnavailable: false,
    };
  } catch {
    return finishWithTemplate(true);
  }
}
