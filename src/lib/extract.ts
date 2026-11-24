import type { ExtractedBooking, FlightLookupResult } from '../types';
import {
  extractTripWithFirebase,
  lookupFlightArrivalWithFirebase,
  transcribeAudioWithFirebase,
} from '../engine/firebaseEngine';

export async function extractTripDetails(params: {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}): Promise<ExtractedBooking> {
  return extractTripWithFirebase(params);
}

export async function lookupFlightArrival(
  flightNumber: string,
  flightDate?: string | null
): Promise<FlightLookupResult> {
  return lookupFlightArrivalWithFirebase(flightNumber, flightDate);
}

export async function transcribeAudioRecording(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  return transcribeAudioWithFirebase(audioBase64, mimeType);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the selected item.'));
    reader.readAsDataURL(blob);
  });
}
