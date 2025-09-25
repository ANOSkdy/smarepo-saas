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

const routeModulePath = new URL('../dist/app/api/calendar/day/route.js', import.meta.url);
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
  globalThis.__calendarBuildDayMock = realLogsModule.buildDayDetail;
}

resetGlobalMocks();

function applyMocks(overrides = {}) {
  if (overrides.auth) globalThis.__calendarAuthMock = overrides.auth;
  if (overrides.getLogs) globalThis.__calendarGetLogsMock = overrides.getLogs;
  if (overrides.buildDay) globalThis.__calendarBuildDayMock = overrides.buildDay;
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
        buildDayDetail: (...args) => globalThis.__calendarBuildDayMock(...args),
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

test('day API requires authentication', async () => {
  const authMock = mock.fn(async () => null);
  const getLogsMock = mock.fn(async () => []);
  const { GET } = await importRouteWith({ auth: authMock, getLogs: getLogsMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025-09-01'));
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: 'UNAUTHORIZED' });
  assert.strictEqual(getLogsMock.mock.calls.length, 0);
});

test('day API validates date format', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const { GET } = await importRouteWith({ auth: authMock, getLogs: mock.fn(async () => []) });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025/09/01'));
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'INVALID_DATE' });
});

test('day API returns punches and paired sessions', async () => {
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
      timestamp: '2025-09-01T07:30:00.000Z',
      timestampMs: Date.parse('2025-09-01T07:30:00.000Z'),
      userId: 'user-1',
      userName: 'suzuki',
      siteId: 'site-1',
      siteName: '札幌第一',
      workType: '溶接',
      note: '現地確認',
    },
    {
      id: 'log-3',
      type: 'OUT',
      timestamp: '2025-09-01T01:00:00.000Z',
      timestampMs: Date.parse('2025-09-01T01:00:00.000Z'),
      userId: 'user-2',
      userName: 'sato',
      siteId: 'site-2',
      siteName: '帯広東',
      workType: null,
      note: null,
    },
    {
      id: 'log-4',
      type: 'IN',
      timestamp: '2025-09-01T02:00:00.000Z',
      timestampMs: Date.parse('2025-09-01T02:00:00.000Z'),
      userId: 'user-2',
      userName: 'sato',
      siteId: 'site-2',
      siteName: '帯広東',
      workType: null,
      note: null,
    },
    {
      id: 'log-5',
      type: 'OUT',
      timestamp: '2025-09-01T09:00:00.000Z',
      timestampMs: Date.parse('2025-09-01T09:00:00.000Z'),
      userId: 'user-2',
      userName: 'sato',
      siteId: 'site-2',
      siteName: '帯広東',
      workType: null,
      note: null,
    },
  ];
  const getLogsMock = mock.fn(async () => baseLogs);
  const { GET } = await importRouteWith({ auth: authMock, getLogs: getLogsMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025-09-01'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.strictEqual(body.date, '2025-09-01');
  assert.strictEqual(body.punches.length, 5);
  assert.strictEqual(body.sessions.length, 2);
  const firstSession = body.sessions[0];
  assert.strictEqual(firstSession.userName, 'suzuki');
  assert.strictEqual(firstSession.clockInAt, '09:00');
  assert.strictEqual(firstSession.clockOutAt, '16:30');
  assert.strictEqual(firstSession.hours, 7.5);
  const secondSession = body.sessions[1];
  assert.strictEqual(secondSession.userName, 'sato');
  assert.strictEqual(secondSession.hours, 7);
});
