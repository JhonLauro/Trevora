import { clearActiveVehicleSelection } from './activeVehicle.js';

const AUTH_STORAGE_KEY = 'trevora.authUser';
const REMOVED_MOCK_OWNER_ID = '00000000-0000-0000-0000-000000000001';
export const AUTH_USER_CHANGED_EVENT = 'trevora:auth-user-changed';

export function getLoggedInUser() {
  const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedUser) {
    return null;
  }

  try {
    const user = JSON.parse(storedUser);
    if (!isUsableAuthUser(user) || user.userId === REMOVED_MOCK_OWNER_ID) {
      clearLoggedInUser();
      return null;
    }
    return user;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function setLoggedInUser(user, session = null) {
  const previousUser = getLoggedInUser();
  const normalizedUser = {
    ...user,
    accessToken: session?.access_token ?? user.accessToken,
    fullName: getUserDisplayName(user),
  };

  if (!previousUser || previousUser.userId !== normalizedUser.userId) {
    clearActiveVehicleSelection();
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedUser));
  notifyAuthUserChanged();
  return normalizedUser;
}

export function clearLoggedInUser() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  clearActiveVehicleSelection();
  notifyAuthUserChanged();
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
