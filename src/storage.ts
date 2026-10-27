/** Persistence in IndexedDB. Floor-plan photos quickly exceed localStorage limits. */

const DB_NAME = 'wlan-abdeckungskarte';
const STORE = 'kv';
const KEY = 'state';
/** Key used by the prototype; read once to take over existing data. */
const LEGACY_LS_KEY = 'wlan-heatmap-v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadRaw(): Promise<unknown> {
  try {
    const v = await tx('readonly', (s) => s.get(KEY));
    if (v != null) return v;
  } catch {
    /* fall through to legacy */
  }
  try {
    const s = localStorage.getItem(LEGACY_LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export async function saveRaw(state: unknown): Promise<void> {
  // Structured clone of plain JSON keeps the stored copy independent of the live object.
  await tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(state)), KEY));
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistence(): void {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

const PREF_PREFIX = 'wlan-abdeckungskarte:';
export function getPref(k: string): string | null {
  try {
    return localStorage.getItem(PREF_PREFIX + k);
  } catch {
    return null;
  }
}
export function setPref(k: string, v: string): void {
  try {
    localStorage.setItem(PREF_PREFIX + k, v);
  } catch {
    /* ignore */
  }
}
