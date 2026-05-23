import { clearActiveVehicleSelection } from './activeVehicle.js';

const AUTH_STORAGE_KEY = 'trevora.authUser';
const REMOVED_MOCK_OWNER_ID = '00000000-0000-0000-0000-000000000001';
const REMEMBERED_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_USER_CHANGED_EVENT = 'trevora:auth-user-changed';

export function getLoggedInUser() {
  return getStoredAuthEntry()?.user ?? null;
}

export function setLoggedInUser(user, session = null, options = {}) {
  const previousEntry = getStoredAuthEntry();
  const previousUser = previousEntry?.user ?? null;
  const remember = options.remember ?? previousEntry?.remember ?? true;
  const rememberedUntil = remember
    ? options.rememberedUntil ?? previousUser?.rememberedUntil ?? Date.now() + REMEMBERED_SESSION_DURATION_MS
    : undefined;
  const normalizedUser = {
    ...user,
    accessToken: session?.access_token ?? user.accessToken,
    fullName: getUserDisplayName(user),
    ...(rememberedUntil ? { rememberedUntil } : {}),
  };

  if (!previousUser || previousUser.userId !== normalizedUser.userId) {
    clearActiveVehicleSelection();
  }

  removeStoredAuthUser();
  getAuthStorage(remember).setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedUser));
  notifyAuthUserChanged();
  return normalizedUser;
}

export function clearLoggedInUser() {
  removeStoredAuthUser();
  clearActiveVehicleSelection();
  notifyAuthUserChanged();
}

function getStoredAuthEntry() {
  const sessionEntry = readStoredAuthUser(window.sessionStorage, false);
  if (sessionEntry) {
    return sessionEntry;
  }

  return readStoredAuthUser(window.localStorage, true);
}

function readStoredAuthUser(storage, remember) {
  const storedUser = storage.getItem(AUTH_STORAGE_KEY);
  if (!storedUser) {
    return null;
  }

  try {
    const user = JSON.parse(storedUser);
    if (!isUsableAuthUser(user) || user.userId === REMOVED_MOCK_OWNER_ID) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (remember && isRememberedSessionExpired(user)) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return { user, remember };
  } catch {
    storage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function isRememberedSessionExpired(user) {
  return Number.isFinite(user.rememberedUntil) && Date.now() > user.rememberedUntil;
}

function getAuthStorage(remember) {
  return remember ? window.localStorage : window.sessionStorage;
}

function removeStoredAuthUser() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getActiveCurrentUser() {
  return getLoggedInUser();
}

export function getUserDisplayName(user) {
  const splitName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return splitName || user?.fullName || user?.label || 'Current User';
}

export function isLoggedIn() {
  return getLoggedInUser() !== null;
}

function isUsableAuthUser(user) {
  return Boolean(
    user
      && typeof user === 'object'
      && typeof user.userId === 'string'
      && typeof user.role === 'string'
      && typeof user.accessToken === 'string'
      && user.accessToken.length > 0
  );
}

function notifyAuthUserChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_USER_CHANGED_EVENT));
  }
}

export function isVehicleOwnerUser(user = getActiveCurrentUser()) {
  return user?.role === 'VEHICLE_OWNER';
}

export function getCurrentUserHeaders() {
  const user = getLoggedInUser();
  if (!user) {
    return {};
  }

  const headers = {};

  if (user.accessToken) {
    headers.Authorization = `Bearer ${user.accessToken}`;
  }

  return headers;
}
