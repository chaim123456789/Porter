import { blobToBase64, transcribeAudioRecording } from './extract';

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultItem {
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultItem>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export interface VoiceController {
  stop: () => void;
}

export function startVoiceCapture(callbacks: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onStop: () => void;
}): VoiceController {
  let active = true;
  let recognition: SpeechRecognitionInstance | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;

  const stopTracks = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  };

  const startMediaFallback = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      callbacks.onStop();
      callbacks.onError('Voice input is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStream = stream;
      const chunks: Blob[] = [];
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      mediaRecorder = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stopTracks();
        callbacks.onStop();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 100) {
          callbacks.onError('No speech was heard. Please try again.');
          return;
        }
        try {
          const base64 = await blobToBase64(blob);
          const transcript = await transcribeAudioRecording(
            base64,
            recorder.mimeType || 'audio/webm'
          );
          callbacks.onTranscript(transcript);
        } catch (err) {
          callbacks.onError(
            err instanceof Error ? err.message : 'Could not transcribe voice input.'
          );
        }
      };

      recorder.start();
    } catch {
      stopTracks();
      callbacks.onStop();
      callbacks.onError('Microphone access was blocked.');
    }
  };

  const SpeechCtor = getSpeechRecognitionCtor();
  if (SpeechCtor) {
    try {
      const rec = new SpeechCtor();
      recognition = rec;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      let latest = '';
      let errored = false;

      rec.onresult = (ev) => {
        let combined = '';
        for (let i = 0; i < ev.results.length; i++) {
          combined += ev.results[i][0].transcript + ' ';
        }
        latest = combined.trim();
      };

      rec.onerror = (ev) => {
        errored = true;
        if (ev.error === 'network') {
          void startMediaFallback();
          return;
        }
        callbacks.onStop();
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          callbacks.onError('Microphone access was blocked.');
        } else if (ev.error !== 'aborted') {
          callbacks.onError('Could not hear you clearly. Please try again.');
        }
      };

      rec.onend = () => {
        if (errored) return;
        callbacks.onStop();
        if (latest) {
          callbacks.onTranscript(latest);
        } else {
          callbacks.onError('No speech was heard. Please try again.');
        }
      };

      rec.start();
    } catch {
      void startMediaFallback();
    }
  } else {
    void startMediaFallback();
  }

  return {
    stop: () => {
      active = false;
      try {
        recognition?.stop();
      } catch {
        // Ignore
      }
      try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      } catch {
        // Ignore
      }
      stopTracks();
    },
  };
}
