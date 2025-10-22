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
let importCounter = 0;

const defaultAuth = async () => {
  throw new Error('auth mock not configured');
};
const defaultGetSummary = async () => {
  throw new Error('getCalendarMonthSummary mock not configured');
};

function resetGlobalMocks() {
  globalThis.__calendarAuthMock = defaultAuth;
  globalThis.__calendarGetSummaryMock = defaultGetSummary;
}

resetGlobalMocks();

function applyMocks(overrides = {}) {
  if (overrides.auth) globalThis.__calendarAuthMock = overrides.auth;
  if (overrides.getSummary) globalThis.__calendarGetSummaryMock = overrides.getSummary;
}

async function importRouteWith(overrides = {}) {
  resetGlobalMocks();
  applyMocks(overrides);
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '@/lib/auth') {
      return { auth: (...args) => globalThis.__calendarAuthMock(...args) };
    }
    if (request === '@/src/lib/data/sessions') {
      return {
        getCalendarMonthSummary: (...args) => globalThis.__calendarGetSummaryMock(...args),
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
  const getSummaryMock = mock.fn(async () => ({ year: 2025, month: 9, days: [] }));
  const { GET } = await importRouteWith({ auth: authMock, getSummary: getSummaryMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { message: 'unauthorized' });
  assert.strictEqual(getSummaryMock.mock.calls.length, 0);
});

test('month API returns empty payload when params are missing', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getSummaryMock = mock.fn(async () => ({ year: 2025, month: 9, days: [] }));
  const { GET } = await importRouteWith({ auth: authMock, getSummary: getSummaryMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=&month='));
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { year: null, month: null, days: [] });
  assert.strictEqual(getSummaryMock.mock.calls.length, 0);
});

test('month API returns summary from sessions service', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const summary = {
    year: 2025,
    month: 9,
    days: [
      { date: '2025-09-01', sites: ['札幌第一'], punches: 4, sessions: 2, hours: 8 },
      { date: '2025-09-02', sites: ['帯広東'], punches: 2, sessions: 1, hours: 7.5 },
    ],
  };
  const getSummaryMock = mock.fn(async () => summary);
  const { GET } = await importRouteWith({ auth: authMock, getSummary: getSummaryMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.deepStrictEqual(body, summary);
  assert.strictEqual(getSummaryMock.mock.calls.length, 1);
  assert.deepStrictEqual(getSummaryMock.mock.calls[0].arguments, [{ year: 2025, month: 9 }]);
});

test('month API handles service failure by returning empty payload', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getSummaryMock = mock.fn(async () => {
    throw new Error('summary unavailable');
  });
  const { GET } = await importRouteWith({ auth: authMock, getSummary: getSummaryMock });
  const response = await GET(new Request('https://example.com/api/calendar/month?year=2025&month=9'));
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { year: null, month: null, days: [] });
});
