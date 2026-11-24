import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Mic, Paperclip, Square, X } from 'lucide-react';
import type { ExtractedBooking, FlightLookupResult } from '../types';
import {
  blobToBase64,
  extractTripDetails,
  lookupFlightArrival,
  transcribeAudioRecording,
} from '../lib/extract';

export interface ExtractionDraft {
  source: 'text' | 'voice';
  transcript: string | null;
  extracted: ExtractedBooking;
  flightLookup: FlightLookupResult;
  flightLookupAttempted: boolean;
}

interface SetupScreenProps {
  isOnline: boolean;
  autoStartVoice?: boolean;
  onAutoVoiceHandled?: () => void;
  onExtracted: (draft: ExtractionDraft) => void;
  onLoadExample: () => void;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
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

export const SetupScreen: React.FC<SetupScreenProps> = ({
  isOnline,
  autoStartVoice,
  onAutoVoiceHandled,
  onExtracted,
  onLoadExample,
}) => {
  const [flightInput, setFlightInput] = useState('');
  const [hotelInput, setHotelInput] = useState('');
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'speech' | 'media' | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const speechTranscriptRef = useRef<string>('');

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      stopMediaStream();
    };
  }, []);

  useEffect(() => {
    if (autoStartVoice && isOnline && !isRecording && !isLoading) {
      onAutoVoiceHandled?.();
      void handleStartRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice]);

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const mimeType = selected.type || 'application/octet-stream';
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      setError('Please choose a photo, screenshot, or PDF booking.');
      e.target.value = '';
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError('That image or PDF is too large. Please choose one under 10 MB.');
      e.target.value = '';
      return;
    }

    try {
      const base64 = await blobToBase64(selected);
      setAttachment({
        name: selected.name || 'Booking confirmation',
        mimeType,
        data: base64,
      });
    } catch {
      setError('Could not read that booking. Please try another image or PDF.');
    } finally {
      e.target.value = '';
    }
  };

  const runExtractionAndLookup = async (
    textPayload: string,
    inlineData: { mimeType: string; data: string } | undefined,
    source: 'text' | 'voice',
    transcript: string | null
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const extracted = await extractTripDetails({
        text: textPayload || undefined,
        inlineData,
      });

      // Discard uploaded booking immediately from memory right after extraction
      setAttachment(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }

      // If user typed a flight number directly and extraction missed it, keep literal fallback only if typed in flight box
      if (!extracted.flightNumber && flightInput.trim() && source === 'text') {
        extracted.flightNumber = flightInput.trim();
      }
      if (!extracted.hotelName && !extracted.hotelAddress && hotelInput.trim() && source === 'text') {
        extracted.hotelName = hotelInput.trim();
      }

      let flightLookup: FlightLookupResult = {
        found: false,
        airportIata: null,
        airportName: null,
        airportCountry: null,
        landingLocalISO: null,
      };
      let flightLookupAttempted = false;

      if (extracted.flightNumber) {
        flightLookupAttempted = true;
        flightLookup = await lookupFlightArrival(extracted.flightNumber, extracted.flightDate);
      }

      onExtracted({
        source,
        transcript,
        extracted,
        flightLookup,
        flightLookupAttempted,
      });
    } catch (err) {
      setAttachment(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read those details right now. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasFlight = flightInput.trim().length > 0;
    const hasHotel = hotelInput.trim().length > 0;
    const hasAttachment = attachment !== null;

    if (!hasFlight && !hasHotel && !hasAttachment) {
      setError('Enter a flight number, a hotel name or address, or upload a booking.');
      return;
    }

    if (!isOnline) {
      setError('Connect once to set up your route. After that Porter works offline.');
      return;
    }

    const parts: string[] = [];
    if (hasFlight) parts.push(`Flight: ${flightInput.trim()}`);
    if (hasHotel) parts.push(`Hotel: ${hotelInput.trim()}`);

    await runExtractionAndLookup(
      parts.join('\n'),
      attachment ? { mimeType: attachment.mimeType, data: attachment.data } : undefined,
      'text',
      null
    );
  };

  const startMediaRecorderFallback = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('Voice recording is not supported in this browser. Please type your details.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      setRecordingMode('media');
      setIsRecording(true);
      setError(null);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setRecordingMode(null);
        stopMediaStream();

        const blob = new Blob(mediaChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        mediaChunksRef.current = [];

        if (blob.size < 100) {
          setError('No voice audio was captured. Please try speaking again.');
          return;
        }

        setIsLoading(true);
        try {
          const base64 = await blobToBase64(blob);
          const transcript = await transcribeAudioRecording(
            base64,
            recorder.mimeType || 'audio/webm'
          );
          await runExtractionAndLookup(transcript, undefined, 'voice', transcript);
        } catch (err) {
          setIsLoading(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Could not transcribe your voice recording.'
          );
        }
      };

      recorder.start();
    } catch {
      stopMediaStream();
      setIsRecording(false);
      setRecordingMode(null);
      setError('Microphone access was blocked. Allow microphone access or type your details.');
    }
  };

  const handleStartRecording = async () => {
    if (!isOnline) {
      setError('Needs a connection');
      return;
    }

    if (isRecording) {
      if (recordingMode === 'speech') {
        recognitionRef.current?.stop();
      } else if (recordingMode === 'media') {
        mediaRecorderRef.current?.stop();
      }
      return;
    }

    setError(null);
    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const recognition = new SpeechCtor();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
        speechTranscriptRef.current = '';
        recognitionRef.current = recognition;
        setRecordingMode('speech');
        setIsRecording(true);

        let handledResult = false;

        recognition.onresult = (event) => {
          let combined = '';
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0].transcript + ' ';
          }
          speechTranscriptRef.current = combined.trim();
        };

        recognition.onerror = (event) => {
          setIsRecording(false);
          setRecordingMode(null);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError('Microphone access was blocked. Allow microphone access or type your details.');
          } else if (event.error === 'network') {
            // Fall back to MediaRecorder + Gemini transcription when browser speech service fails
            void startMediaRecorderFallback();
          } else if (event.error !== 'aborted') {
            setError('Could not hear you clearly. Please tap "Speak it" and try again.');
          }
          handledResult = true;
        };

        recognition.onend = () => {
          setIsRecording(false);
          setRecordingMode(null);
          if (handledResult) return;
          const transcript = speechTranscriptRef.current.trim();
          if (!transcript) {
            setError('No speech was heard. Tap "Speak it" and try again.');
            return;
          }
          void runExtractionAndLookup(transcript, undefined, 'voice', transcript);
        };

        recognition.start();
        return;
      } catch {
        setIsRecording(false);
        setRecordingMode(null);
      }
    }

    await startMediaRecorderFallback();
  };

  return (
    <section className="mx-auto w-full max-w-[480px] px-4 py-8 sm:py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
          Landing somewhere new?
        </h1>
        <p className="text-base leading-relaxed text-slate-600">
          Tell Porter your flight or hotel. Get the safe way to your door, even offline.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="space-y-1.5">
          <label htmlFor="flight-input" className="block text-sm font-semibold text-slate-800">
            Flight number
          </label>
          <input
            id="flight-input"
            type="text"
            value={flightInput}
            onChange={(e) => {
              setFlightInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Flight number, for example BA 106"
            autoComplete="off"
            disabled={isLoading}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 disabled:bg-slate-50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="hotel-input" className="block text-sm font-semibold text-slate-800">
            Hotel name or address
          </label>
          <input
            id="hotel-input"
            type="text"
            value={hotelInput}
            onChange={(e) => {
              setHotelInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Hotel name or street address"
            autoComplete="off"
            disabled={isLoading}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 disabled:bg-slate-50"
          />
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleAttachmentChange}
          className="hidden"
          aria-label="Upload ticket or booking"
        />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isLoading || isRecording}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
          >
            <Paperclip className="h-4 w-4 text-[#0F766E] shrink-0" aria-hidden="true" />
            <span>Upload ticket or booking</span>
          </button>

          <button
            type="button"
            onClick={() => void handleStartRecording()}
            disabled={!isOnline || isLoading}
            aria-label={!isOnline ? 'Needs a connection' : isRecording ? 'Tap to stop recording' : 'Speak it'}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] ${
              !isOnline
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                : isRecording
                  ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            {isRecording ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse shrink-0" aria-hidden="true" />
                <Square className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true" />
                <span>Tap to stop</span>
              </>
            ) : !isOnline ? (
              <>
                <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Needs a connection</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 text-[#0F766E] shrink-0" aria-hidden="true" />
                <span>Speak it</span>
              </>
            )}
          </button>
        </div>

        {attachment && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-sm text-teal-950">
            <span className="truncate font-medium">Booking attached: {attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove attached booking"
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-teal-800 hover:bg-teal-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || isRecording}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
        >
          <span>{isLoading ? 'Reading your trip details…' : 'Get my route'}</span>
          {!isLoading && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onLoadExample}
          disabled={isLoading || isRecording}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-[#0F766E] transition-colors hover:bg-teal-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0F766E]"
        >
          Show me an example
        </button>
      </div>
    </section>
  );
};
