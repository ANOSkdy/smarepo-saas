import { test, mock } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Module from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

execSync(
  'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
  { cwd: projectRoot, stdio: 'inherit' }
);

const routeModulePath = new URL('../dist/app/api/dashboard/calendar/route.js', import.meta.url);
let importCounter = 0;

const defaultAuth = async () => {
  throw new Error('auth mock not configured');
};
const defaultProjects = async () => {
  throw new Error('projects mock not configured');
};
const defaultSessionsMonth = async () => {
  throw new Error('sessions month mock not configured');
};
const defaultSessionsDay = async () => {
  throw new Error('sessions day mock not configured');
};

function resetGlobalMocks() {
  globalThis.__dashboardAuthMock = defaultAuth;
  globalThis.__dashboardProjectsMock = defaultProjects;
  globalThis.__dashboardSessionsMonthMock = defaultSessionsMonth;
  globalThis.__dashboardSessionsDayMock = defaultSessionsDay;
}

resetGlobalMocks();

function applyMocks(overrides) {
  if (overrides.auth) globalThis.__dashboardAuthMock = overrides.auth;
  if (overrides.sessionsMonth) globalThis.__dashboardSessionsMonthMock = overrides.sessionsMonth;
  if (overrides.sessionsDay) globalThis.__dashboardSessionsDayMock = overrides.sessionsDay;
  if (overrides.projects) globalThis.__dashboardProjectsMock = overrides.projects;
}

async function importRoute() {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '@/lib/auth') {
      return { auth: (...args) => globalThis.__dashboardAuthMock(...args) };
    }
    if (request === '@/lib/airtable/projects') {
      return { getDashboardProjects: (...args) => globalThis.__dashboardProjectsMock(...args) };
    }
    if (request === '@/lib/airtable/sessions') {
      return {
        getSessionsByMonth: (...args) => globalThis.__dashboardSessionsMonthMock(...args),
        getSessionsByDay: (...args) => globalThis.__dashboardSessionsDayMock(...args),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await import(`${routeModulePath.href}?v=${importCounter++}`);
  } finally {
    Module._load = originalLoad;
  }
}

async function loadRouteWith(overrides) {
  resetGlobalMocks();
  applyMocks(overrides);
  return importRoute();
}

test('calendar API validates params', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user' } }));
  const { GET } = await loadRouteWith({ auth: authMock, sessionsMonth: mock.fn(async () => ({ year: 0, month: 0, days: [] })) });
  const response = await GET(new Request('https://example.com/api/dashboard/calendar?year=2024&month=13'));
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'INVALID_RANGE', code: 'INVALID_RANGE' });
});

test('calendar API returns aggregate payload', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user' } }));
  const getSessionsMock = mock.fn(async (params) => ({
    ...params,
    days: [
      { date: '2024-02-01', hours: 7.5, sessions: 2 },
      { date: '2024-02-02', hours: 8, sessions: 1 },
    ],
  }));
  const { GET } = await loadRouteWith({ auth: authMock, sessionsMonth: getSessionsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/calendar?year=2024&month=2'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.deepStrictEqual(body.days.length, 2);
  assert.strictEqual(getSessionsMock.mock.calls[0].arguments[0].year, 2024);
  assert.strictEqual(getSessionsMock.mock.calls[0].arguments[0].month, 2);
});

test('calendar API requires auth', async () => {
  const authMock = mock.fn(async () => null);
  const sessionsMock = mock.fn(async () => ({ year: 0, month: 0, days: [] }));
  const { GET } = await loadRouteWith({ auth: authMock, sessionsMonth: sessionsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/calendar?year=2024&month=2'));
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
  assert.strictEqual(sessionsMock.mock.calls.length, 0);
});
