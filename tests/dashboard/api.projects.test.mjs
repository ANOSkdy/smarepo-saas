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

const routeModulePath = new URL('../dist/app/api/dashboard/projects/route.js', import.meta.url);
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
  if (overrides.projects) globalThis.__dashboardProjectsMock = overrides.projects;
  if (overrides.sessionsMonth) globalThis.__dashboardSessionsMonthMock = overrides.sessionsMonth;
  if (overrides.sessionsDay) globalThis.__dashboardSessionsDayMock = overrides.sessionsDay;
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

test('projects API requires authentication', async () => {
  const authMock = mock.fn(async () => null);
  const projectsMock = mock.fn(async () => {
    throw new Error('getDashboardProjects should not be called on unauthorized request');
  });
  const { GET } = await loadRouteWith({ auth: authMock, projects: projectsMock });
  const response = await GET(new Request('https://example.com/api/dashboard/projects'));
  assert.strictEqual(authMock.mock.calls.length, 1);
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
  assert.strictEqual(projectsMock.mock.calls.length, 0);
});

test('projects API forwards validated query params', async () => {
  const authMock = mock.fn(async () => ({ user: { id: 'user-1' } }));
  const getProjectsMock = mock.fn(async () => ({
    total: 1,
    items: [
      {
        projectId: 'p-1',
        name: '案件A',
        siteName: '東京',
        status: '進行中',
        startDate: '2024-01-01',
        endDate: '2024-02-01',
        progressPercent: 75,
        spreadsheetUrl: 'https://example.com',
      },
    ],
  }));
  const { GET } = await loadRouteWith({
    auth: authMock,
    projects: getProjectsMock,
  });
  const response = await GET(
    new Request(
      'https://example.com/api/dashboard/projects?status=進行中&sort=progress&order=asc&page=2&pageSize=5&search=東京'
    )
  );
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.deepStrictEqual(body.total, 1);
  assert.deepStrictEqual(body.items[0].name, '案件A');
  assert.strictEqual(getProjectsMock.mock.calls.length, 1);
  const args = getProjectsMock.mock.calls[0].arguments[0];
  assert.deepStrictEqual(args, {
    search: '東京',
    status: '進行中',
    sort: 'progress',
    order: 'asc',
    page: 2,
    pageSize: 5,
  });
});
