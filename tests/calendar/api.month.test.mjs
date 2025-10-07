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
  { cwd: projectRoot, stdio: 'inherit' },
);

const routeModulePath = new URL('../dist/app/api/calendar/month/route.js', import.meta.url);
const logsModulePath = new URL('../dist/lib/airtable/logs.js', import.meta.url);
let importCounter = 0;
let logsImportCounter = 0;

async function loadLogsModule() {
  if (globalThis.__calendarLogsModule) {
    return globalThis.__calendarLogsModule;
  }
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '@/lib/airtable') {
      return {
        logsTable: {
          select: () => ({
            all: async () => {
              throw new Error('logsTable.select not available in tests');
            },
          }),
        },
        usersTable: {
          select: () => ({
            all: async () => [],
          }),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loadedModule = await import(`${logsModulePath.href}?real=${logsImportCounter++}`);
    globalThis.__calendarLogsModule = loadedModule;
    return loadedModule;
  } finally {
    Module._load = originalLoad;
  }
}

const realLogsModule = await loadLogsModule();

const defaultAuth = async () => {
  throw new Error('auth mock not configured');
};
const defaultGetLogs = async () => {
  throw new Error('getLogsBetween mock not configured');
};

function resetGlobalMocks() {
  globalThis.__calendarAuthMock = defaultAuth;
  globalThis.__calendarGetLogsMock = defaultGetLogs;
  globalThis.__calendarSummariseMock = realLogsModule.summariseMonth;
}

resetGlobalMocks();

function applyMocks(overrides = {}) {
  if (overrides.auth) globalThis.__calendarAuthMock = overrides.auth;
  if (overrides.getLogs) globalThis.__calendarGetLogsMock = overrides.getLogs;
  if (overrides.summarise) globalThis.__calendarSummariseMock = overrides.summarise;
}

async function importRouteWith(overrides = {}) {
  resetGlobalMocks();
  applyMocks(overrides);
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '@/lib/auth') {
      return { auth: (...args) => globalThis.__calendarAuthMock(...args) };
    }
    if (request === '@/lib/airtable/logs') {
      return {
        getLogsBetween: (...args) => globalThis.__calendarGetLogsMock(...args),
        summariseMonth: (...args) => globalThis.__calendarSummariseMock(...args),
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

test('month API returns 401 when unauthenticated', async () => {
  const authMock = mock.fn(async () => null);
  const getLogsMock = mock.fn(async () => []);
  const { GET } = await importRouteWith({ auth: authMock, getLogs: getLogsMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { message: 'unauthorized' });
  assert.strictEqual(getLogsMock.mock.calls.length, 0);
});

test('month API returns empty payload when params are missing', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const { GET } = await importRouteWith({ auth: authMock, getLogs: mock.fn(async () => []) });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=&month='));
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { year: null, month: null, days: [] });
});

test('month API returns empty payload when Airtable access fails', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getLogsMock = mock.fn(async () => {
    throw new Error('airtable down');
  });
  const { GET } = await importRouteWith({ auth: authMock, getLogs: getLogsMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { year: null, month: null, days: [] });
});

test('month API aggregates punches and sessions', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const baseLogs = [
    {
      id: 'log-1',
      type: 'IN',
      timestamp: '2025-09-01T00:00:00.000Z',
      timestampMs: Date.parse('2025-09-01T00:00:00.000Z'),
      userId: 'user-1',
      userName: 'suzuki',
      siteId: 'site-1',
      siteName: '札幌第一',
      workType: '溶接',
      note: null,
    },
    {
      id: 'log-2',
      type: 'OUT',
      timestamp: '2025-09-01T08:30:00.000Z',
      timestampMs: Date.parse('2025-09-01T08:30:00.000Z'),
      userId: 'user-1',
      userName: 'suzuki',
      siteId: 'site-1',
      siteName: '札幌第一',
      workType: '溶接',
      note: null,
    },
    {
      id: 'log-3',
      type: 'IN',
      timestamp: '2025-09-02T00:30:00.000Z',
      timestampMs: Date.parse('2025-09-02T00:30:00.000Z'),
      userId: 'user-2',
      userName: 'sato',
      siteId: 'site-2',
      siteName: '帯広東',
      workType: null,
      note: null,
    },
    {
      id: 'log-4',
      type: 'OUT',
      timestamp: '2025-09-02T07:00:00.000Z',
      timestampMs: Date.parse('2025-09-02T07:00:00.000Z'),
      userId: 'user-2',
      userName: 'sato',
      siteId: 'site-2',
      siteName: '帯広東',
      workType: null,
      note: 'note',
    },
  ];
  const getLogsMock = mock.fn(async () => baseLogs);
  const { GET } = await importRouteWith({ auth: authMock, getLogs: getLogsMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.strictEqual(body.days.length, 2);
  const firstDay = body.days.find((day) => day.date === '2025-09-01');
  assert.ok(firstDay);
  assert.strictEqual(firstDay.punches, 2);
  assert.strictEqual(firstDay.sessions, 1);
  assert.strictEqual(firstDay.hours, 8.5);
  assert.deepStrictEqual(firstDay.sites, ['札幌第一']);
});
