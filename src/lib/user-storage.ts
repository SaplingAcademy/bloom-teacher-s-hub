/**
 * Per-account isolation for Bloom data kept in the browser.
 *
 * - Personal data that must persist is stored under `${base}:${userId}`.
 * - `ensureStorageOwner()` purges every Bloom key left by a different account
 *   (covers expired sessions where logout never ran).
 * - `purgeBloomLocalData()` runs on logout. It only touches keys with the
 *   Bloom prefix — never localStorage.clear().
 */

const OWNER_KEY = "bloom.storage.owner";
/** Device-level preferences that are not personal data and survive logout. */
const DEVICE_KEYS = new Set(["bloom.dashboard.lang", "bloom.dashboard.lang.manual", "bloom_sidebar_pinned"]);

let currentUserId: string | null = null;

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function isBloomKey(key: string): boolean {
  return key.startsWith("bloom.") || key.startsWith("bloom_");
}

export function getStorageOwner(): string | null {
  return currentUserId;
}

export function userScopedKey(base: string, userId: string | null = currentUserId): string | null {
  return userId ? `${base}:${userId}` : null;
}

export function getUserItem(base: string, userId: string | null = currentUserId): string | null {
  const key = userScopedKey(base, userId);
  if (!key || !hasStorage()) return null;
  return localStorage.getItem(key);
}

export function setUserItem(base: string, value: string, userId: string | null = currentUserId): void {
  const key = userScopedKey(base, userId);
  if (!key || !hasStorage()) return;
  localStorage.setItem(key, value);
}

export function removeUserItem(base: string, userId: string | null = currentUserId): void {
  const key = userScopedKey(base, userId);
  if (!key || !hasStorage()) return;
  localStorage.removeItem(key);
}

/** Removes Bloom keys from local/session storage (device preferences kept). */
export function purgeBloomLocalData(): void {
  currentUserId = null;
  if (!hasStorage()) return;
  for (const store of [localStorage, sessionStorage]) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && isBloomKey(k) && !DEVICE_KEYS.has(k)) keys.push(k);
    }
    keys.forEach((k) => store.removeItem(k));
  }
}

/** Binds browser storage to the authenticated user; purges data of any other account. */
export function ensureStorageOwner(userId: string): void {
  if (!hasStorage()) {
    currentUserId = userId;
    return;
  }
  const previous = localStorage.getItem(OWNER_KEY);
  if (previous !== userId) {
    purgeBloomLocalData();
    localStorage.setItem(OWNER_KEY, userId);
  }
  currentUserId = userId;
}
