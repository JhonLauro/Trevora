export const DEMO_USERS = [
  {
    label: 'Demo Vehicle Owner',
    userId: '00000000-0000-0000-0000-000000000001',
    role: 'VEHICLE_OWNER',
  },
  {
    label: 'Demo Mechanic',
    userId: '00000000-0000-0000-0000-000000000002',
    role: 'MECHANIC',
  },
];

const STORAGE_KEY = 'trevora.demoUser';

export function getCurrentDemoUser() {
  const storedUserId = window.localStorage.getItem(STORAGE_KEY);
  return DEMO_USERS.find((user) => user.userId === storedUserId) ?? DEMO_USERS[0];
}

export function setCurrentDemoUser(userId) {
  const nextUser = DEMO_USERS.find((user) => user.userId === userId) ?? DEMO_USERS[0];
  window.localStorage.setItem(STORAGE_KEY, nextUser.userId);
  return nextUser;
}

export function getCurrentUserHeaders() {
  const user = getCurrentDemoUser();
  return {
    'X-User-Id': user.userId,
    'X-User-Role': user.role,
  };
}
