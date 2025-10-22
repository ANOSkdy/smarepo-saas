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
let importCounter = 0;

const defaultAuth = async () => {
  throw new Error('auth mock not configured');
};
const defaultGetDetail = async () => {
  throw new Error('getCalendarDayDetail mock not configured');
};

function resetGlobalMocks() {
  globalThis.__calendarAuthMock = defaultAuth;
  globalThis.__calendarGetDetailMock = defaultGetDetail;
}

resetGlobalMocks();

function applyMocks(overrides = {}) {
  if (overrides.auth) globalThis.__calendarAuthMock = overrides.auth;
  if (overrides.getDetail) globalThis.__calendarGetDetailMock = overrides.getDetail;
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
        getCalendarDayDetail: (...args) => globalThis.__calendarGetDetailMock(...args),
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
  const getDetailMock = mock.fn(async () => ({ date: '2025-09-01', sessions: [] }));
  const { GET } = await importRouteWith({ auth: authMock, getDetail: getDetailMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025-09-01'));
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: 'UNAUTHORIZED' });
  assert.strictEqual(getDetailMock.mock.calls.length, 0);
});

test('day API validates date format', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getDetailMock = mock.fn(async () => ({ date: '2025-09-01', sessions: [] }));
  const { GET } = await importRouteWith({ auth: authMock, getDetail: getDetailMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025/09/01'));
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'INVALID_DATE' });
  assert.strictEqual(getDetailMock.mock.calls.length, 0);
});

test('day API returns session details from sessions service', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const detail = {
    date: '2025-09-01',
    sessions: [
      {
        userId: 'user-1',
        userName: '鈴木 一郎',
        siteName: '札幌第一',
        clockInAt: '07:00',
        clockOutAt: '12:30',
        hours: 5.5,
        status: '正常',
        machineId: '1001',
        machineName: '高所作業車',
        workDescription: '現場点検',
      },
      {
        userId: 'user-2',
        userName: '佐藤 花子',
        siteName: '帯広東',
        clockInAt: '13:00',
        clockOutAt: null,
        hours: null,
        status: '稼働中',
        machineId: '2002',
        machineName: 'フォークリフト',
        workDescription: '荷卸し',
      },
    ],
  };
  const getDetailMock = mock.fn(async () => detail);
  const { GET } = await importRouteWith({ auth: authMock, getDetail: getDetailMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025-09-01'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.deepStrictEqual(body, detail);
  assert.strictEqual(getDetailMock.mock.calls.length, 1);
  assert.deepStrictEqual(getDetailMock.mock.calls[0].arguments, ['2025-09-01']);
});

test('day API handles service failure', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getDetailMock = mock.fn(async () => {
    throw new Error('detail unavailable');
  });
  const { GET } = await importRouteWith({ auth: authMock, getDetail: getDetailMock });
  const response = await GET(new Request('https://example.com/api/calendar/day?date=2025-09-01'));
  assert.strictEqual(response.status, 500);
  const body = await response.json();
  assert.deepStrictEqual(body, { error: 'INTERNAL_ERROR' });
});
