import type { TripPlan } from './types';

const DB_NAME = 'porter-db';
const DB_VERSION = 1;
const STORE_NAME = 'trips';
const ACTIVE_KEY = 'active-trip';
const LS_FALLBACK_KEY = 'porter_active_trip_v1';
const MAX_JSON_BYTES = 200 * 1024;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
  });
}

function validatePlan(plan: TripPlan): TripPlan {
  if (!plan || typeof plan !== 'object' || typeof plan.id !== 'string' || !plan.id) {
    throw new Error('Trip plan is missing a valid identifier.');
  }
  const serialized = JSON.stringify(plan);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > MAX_JSON_BYTES) {
    throw new Error('Trip plan exceeds the 200KB storage limit.');
  }
  return JSON.parse(serialized) as TripPlan;
}

function isExpired(plan: TripPlan): boolean {
  if (!plan.expiresAt) return false;
  const expiryMs = Date.parse(plan.expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return Date.now() > expiryMs;
}

function saveToLocalStorage(plan: TripPlan): void {
  try {
    window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(plan));
  } catch {
    // Ignore quota errors in restricted modes
  }
}

function loadFromLocalStorage(): TripPlan | null {
  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TripPlan;
  } catch {
    return null;
  }
}

function clearFromLocalStorage(): void {
  try {
    window.localStorage.removeItem(LS_FALLBACK_KEY);
  } catch {
    // Ignore
  }
}

export async function savePlan(plan: TripPlan): Promise<TripPlan> {
  const validPlan = validatePlan(plan);
  saveToLocalStorage(validPlan);

  if (!isIndexedDBAvailable()) {
    return validPlan;
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(validPlan, ACTIVE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Could not save trip.'));
      };
    });
  } catch {
    // localStorage fallback already written
  }

  return validPlan;
}

export async function loadPlan(): Promise<TripPlan | null> {
  let plan: TripPlan | null = null;

  if (isIndexedDBAvailable()) {
    try {
      const db = await openDatabase();
      plan = await new Promise<TripPlan | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(ACTIVE_KEY);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as TripPlan | undefined) ?? null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      plan = loadFromLocalStorage();
    }
  } else {
    plan = loadFromLocalStorage();
  }

  if (!plan) {
    plan = loadFromLocalStorage();
  }

  if (!plan) return null;

  if (isExpired(plan)) {
    await clearPlan();
    return null;
  }

  return plan;
}

export async function clearPlan(): Promise<void> {
  clearFromLocalStorage();

  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(ACTIVE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore IndexedDB errors on clear
  }
}

export async function replacePlan(buildNext: () => Promise<TripPlan> | TripPlan): Promise<TripPlan> {
  const nextPlan = validatePlan(await buildNext());
  return savePlan(nextPlan);
}

const PICKED_ROUTE_PREFIX = 'porter_picked_route_v1_';

export function savePickedRouteId(planId: string, routeId: string | null): void {
  try {
    if (!planId) return;
    if (routeId) {
      window.localStorage.setItem(`${PICKED_ROUTE_PREFIX}${planId}`, routeId);
    } else {
      window.localStorage.removeItem(`${PICKED_ROUTE_PREFIX}${planId}`);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadPickedRouteId(planId: string): string | null {
  try {
    if (!planId) return null;
    return window.localStorage.getItem(`${PICKED_ROUTE_PREFIX}${planId}`);
  } catch {
    return null;
  }
}

