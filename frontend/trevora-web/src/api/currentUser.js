const AUTH_STORAGE_KEY = 'trevora.authUser';
const REMOVED_MOCK_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export function getLoggedInUser() {
  const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedUser) {
    return null;
  }

  try {
    const user = JSON.parse(storedUser);
    if (user?.userId === REMOVED_MOCK_OWNER_ID) {
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
  const normalizedUser = {
    ...user,
    accessToken: session?.access_token ?? user.accessToken,
    fullName: getUserDisplayName(user),
  };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedUser));
  return normalizedUser;
}

export function clearLoggedInUser() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
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
