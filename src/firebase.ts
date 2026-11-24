import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';

const env =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

function readEnv(key: string): string {
  const val = env[key];
  return typeof val === 'string' ? val.trim() : '';
}

const REQUIRED_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_APPCHECK_SITE_KEY',
] as const;

export const missingFirebaseEnvVars: string[] = REQUIRED_ENV_KEYS.filter(
  (key) => readEnv(key).length === 0
);

export const isFirebaseConfigured = missingFirebaseEnvVars.length === 0;

let appInstance: FirebaseApp | null = null;
let aiInstance: AI | null = null;
let appCheckInitialized = false;
let lastFirebaseErrorMessage: string | null = null;

export function setLastFirebaseError(err: unknown): void {
  if (err === null) {
    lastFirebaseErrorMessage = null;
    return;
  }
  if (typeof err === 'string') {
    lastFirebaseErrorMessage = err;
    return;
  }
  if (err instanceof Error) {
    lastFirebaseErrorMessage = err.message;
    return;
  }
  lastFirebaseErrorMessage = 'Firebase AI request could not complete.';
}

export function getLastFirebaseError(): string | null {
  return lastFirebaseErrorMessage;
}

if (isFirebaseConfigured && typeof window !== 'undefined') {
  try {
    const firebaseConfig = {
      apiKey: readEnv('VITE_FIREBASE_API_KEY'),
      authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
      storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: readEnv('VITE_FIREBASE_APP_ID'),
    };

    appInstance =
      getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

    if (readEnv('VITE_APPCHECK_DEBUG') === 'true' && typeof self !== 'undefined') {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        true;
    }

    initializeAppCheck(appInstance, {
      provider: new ReCaptchaEnterpriseProvider(readEnv('VITE_APPCHECK_SITE_KEY')),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;

    aiInstance = getAI(appInstance, { backend: new GoogleAIBackend() });
  } catch (err) {
    setLastFirebaseError(err);
    aiInstance = null;
  }
} else if (!isFirebaseConfigured) {
  setLastFirebaseError(
    "Porter isn't configured yet. Add the Firebase settings in your environment."
  );
}

export const app: FirebaseApp | null = appInstance;
export const ai: AI | null = aiInstance;
export const appCheckReady: boolean = appCheckInitialized;
