export const DEMO_USERS = [
  {
    label: 'Demo Vehicle Owner',
    firstName: 'Demo Vehicle',
    lastName: 'Owner',
    userId: '00000000-0000-0000-0000-000000000001',
    role: 'VEHICLE_OWNER',
  },
];

const STORAGE_KEY = 'trevora.demoUser';
const AUTH_STORAGE_KEY = 'trevora.authUser';

export function getCurrentDemoUser() {
  const storedUserId = window.localStorage.getItem(STORAGE_KEY);
  return DEMO_USERS.find((user) => user.userId === storedUserId) ?? DEMO_USERS[0];
}

export function setCurrentDemoUser(userId) {
  const nextUser = DEMO_USERS.find((user) => user.userId === userId) ?? DEMO_USERS[0];
  window.localStorage.setItem(STORAGE_KEY, nextUser.userId);
  return nextUser;
}

export function getLoggedInUser() {
  const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
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
  return getLoggedInUser() ?? getCurrentDemoUser();
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
  const user = getActiveCurrentUser();
  const headers = {
    'X-User-Id': user.userId,
    'X-User-Role': user.role,
  };

  if (user.accessToken) {
    headers.Authorization = `Bearer ${user.accessToken}`;
  }

  return headers;
}
