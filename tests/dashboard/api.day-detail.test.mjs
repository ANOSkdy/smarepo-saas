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

const routeModulePath = new URL('../dist/app/api/dashboard/day-detail/route.js', import.meta.url);
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
  if (overrides.sessionsDay) globalThis.__dashboardSessionsDayMock = overrides.sessionsDay;
  if (overrides.sessionsMonth) globalThis.__dashboardSessionsMonthMock = overrides.sessionsMonth;
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

test('day detail API requires date param', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user' } }));
  const sessionsMock = mock.fn(async () => ({ date: '', spreadsheetUrl: null, sessions: [] }));
  const { GET } = await loadRouteWith({ auth: authMock, sessionsDay: sessionsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/day-detail'));
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'MISSING_DATE', code: 'MISSING_DATE' });
  assert.strictEqual(sessionsMock.mock.calls.length, 0);
});

test('day detail API handles invalid date format', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user' } }));
  const getSessionsMock = mock.fn(async () => {
    throw new Error('Invalid date format');
  });
  const { GET } = await loadRouteWith({ auth: authMock, sessionsDay: getSessionsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/day-detail?date=invalid'));
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'INVALID_DATE', code: 'INVALID_DATE' });
});

test('day detail API returns payload with spreadsheet URL', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user' } }));
  const getSessionsMock = mock.fn(async () => ({
    date: '2024-02-01',
    spreadsheetUrl: 'https://example.com/sheet',
    sessions: [
      {
        username: '山田',
        sitename: '東京',
        workdescription: '点検',
        clockInAt: '2024-02-01T09:00:00+09:00',
        clockOutAt: '2024-02-01T18:00:00+09:00',
        hours: 9,
        projectName: '案件A',
      },
    ],
  }));
  const { GET } = await loadRouteWith({ auth: authMock, sessionsDay: getSessionsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/day-detail?date=2024-02-01'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.strictEqual(body.sessions.length, 1);
  assert.strictEqual(body.spreadsheetUrl, 'https://example.com/sheet');
  assert.strictEqual(getSessionsMock.mock.calls.length, 1);
});
