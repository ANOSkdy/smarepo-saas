import { exit } from 'node:process';
import {
  buildCompositeKeyFormula,
  findOneByCompositeKey,
  getRecords,
  sleep,
  type CompositeSessionKey,
} from '../src/lib/airtable/assert';

type StepStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

type StepResult = {
  status: StepStatus;
  detail?: string;
};

type EnvConfig = {
  baseUrl: string;
  logsTable: string;
  sessionsTable: string;
  reportIndexTable: string;
};

type OutToSessionResponse = {
  ok?: boolean;
  message?: string;
  hours?: number;
  key?: CompositeSessionKey;
};

type BackfillResponse = {
  ok?: boolean;
  processed?: number;
  created?: number;
  skipped?: number;
  message?: string;
};

type AirtableRecordFields = Record<string, unknown>;

type CompositeCheckResult = {
  found: boolean;
  attempts: number;
  formula: string;
  lastError?: string;
};

const REQUIRED_ENV_VARS = [
  'APP_BASE_URL',
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID',
  'AIRTABLE_TABLE_LOGS',
  'AIRTABLE_TABLE_SESSIONS',
  'AIRTABLE_TABLE_REPORT_INDEX',
  'TZ',
] as const;

const TOKYO_TZ = 'Asia/Tokyo';
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 8_000;

function formatEnvError(missing: string[]): string {
  return `Missing required environment variables: ${missing.join(', ')}`;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function loadEnv(): EnvConfig {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(formatEnvError(missing));
  }

  if (process.env.TZ !== TOKYO_TZ) {
    throw new Error(`TZ must be set to ${TOKYO_TZ}`);
  }

  return {
    baseUrl: normalizeBaseUrl(process.env.APP_BASE_URL as string),
    logsTable: process.env.AIRTABLE_TABLE_LOGS as string,
    sessionsTable: process.env.AIRTABLE_TABLE_SESSIONS as string,
    reportIndexTable: process.env.AIRTABLE_TABLE_REPORT_INDEX as string,
  };
}

function getTokyoDateString(reference = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TOKYO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(reference);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      values[part.type] = part.value;
    }
  }
  const year = values.year ?? '0000';
  const month = values.month ?? '01';
  const day = values.day ?? '01';
  return `${year}-${month}-${day}`;
}

function buildDiagnosticPayload(date: string) {
  const baseDate = date;
  return {
    userId: '115',
    siteId: 'SITE-DIAG',
    machineId: '1001',
    workdescription: '診断テスト',
    clockInAt: `${baseDate}T08:30:00+09:00`,
    clockOutAt: `${baseDate}T17:15:00+09:00`,
    username: 'Diag User',
    sitename: 'Diag Site',
    machinename: 'Diag Machine',
  };
}

function readStringField(fields: AirtableRecordFields, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'string' && first.trim().length > 0) {
        return first;
      }
    }
  }
  return null;
}

function formatLogSummary(record: { id: string; fields: AirtableRecordFields }): string {
  const fields = record.fields;
  const user = readStringField(fields, ['userId', 'user', 'username']);
  const machine = readStringField(fields, [
    'machineId',
    'machineid',
    'machineId (from machine)',
    'machineid (from machine)',
    'machineName',
    'machinename',
  ]);
  const site = readStringField(fields, ['siteId', 'site', 'siteName', 'sitename']);
  const date = typeof fields.date === 'string' ? fields.date : 'unknown';
  return `${record.id} (date=${date} user=${user ?? 'n/a'} site=${site ?? 'n/a'} machine=${
    machine ?? 'n/a'
  })`;
}

async function checkHostReachable(baseUrl: string): Promise<StepResult> {
  try {
    const response = await fetch(`${baseUrl}/api/out-to-session`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (response.status === 404 || response.status === 405) {
      return { status: 'PASS', detail: `status=${response.status}` };
    }
    return {
      status: 'FAIL',
      detail: `Unexpected status ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function postJson<T>(
  url: string,
  payload: unknown,
): Promise<{ status: number; data: T | null; raw: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!raw.trim()) {
    return { status: response.status, data: null, raw: '' };
  }
  try {
    return { status: response.status, data: JSON.parse(raw) as T, raw };
  } catch {
    return { status: response.status, data: null, raw };
  }
}

async function pollForCompositeKey(
  table: string,
  key: CompositeSessionKey,
): Promise<CompositeCheckResult> {
  const start = Date.now();
  const formula = buildCompositeKeyFormula(key);
  let attempts = 0;
  let lastError: string | undefined;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    attempts += 1;
    try {
      const record = await findOneByCompositeKey<AirtableRecordFields>(table, key);
      if (record) {
        return { found: true, attempts, formula };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return { found: false, attempts, formula, lastError };
}

async function ensureCompositeUpsert(
  tables: readonly string[],
  key: CompositeSessionKey,
  stepLabel: 'A' | 'B',
): Promise<StepResult> {
  const results: CompositeCheckResult[] = [];
  for (const table of tables) {
    const result = await pollForCompositeKey(table, key);
    results.push(result);
    if (result.found) {
      console.log(
        `[diag-${stepLabel}] ${table} upsert confirmed (${result.attempts} checks, formula=${result.formula})`,
      );
    } else {
      const reason = result.lastError ? ` error=${result.lastError}` : '';
      console.error(
        `[diag-${stepLabel}] ${table} upsert NOT found after ${result.attempts} checks formula=${result.formula}${reason}`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const missing = results.filter((entry) => !entry.found);
  if (missing.length > 0) {
    const details = missing
      .map((entry) => `${entry.formula}${entry.lastError ? ` error=${entry.lastError}` : ''}`)
      .join(' | ');
    return {
      status: 'FAIL',
      detail: `missing records: ${details}`,
    };
  }
  return { status: 'PASS' };
}

async function runStepA(env: EnvConfig): Promise<StepResult> {
  console.log('[diag] checking environment');
  const result = await checkHostReachable(env.baseUrl);
  if (result.status === 'PASS') {
    console.log(`[diag] env OK / host reachable (${result.detail ?? ''})`);
  } else {
    console.error(`[diag] host check failed: ${result.detail ?? 'unknown error'}`);
  }
  return result;
}

async function runStepB(env: EnvConfig, date: string): Promise<StepResult> {
  const payload = buildDiagnosticPayload(date);
  const response = await postJson<OutToSessionResponse>(`${env.baseUrl}/api/out-to-session`, payload);
  if (response.status !== 200) {
    console.error(
      `[diag-A] POST /api/out-to-session -> status=${response.status} body=${response.raw || '<empty>'}`,
    );
    return { status: 'FAIL', detail: `status ${response.status}` };
  }

  const data = response.data;
  if (!data || !data.ok) {
    console.error(`[diag-A] unexpected response body: ${response.raw || '<empty>'}`);
    return { status: 'FAIL', detail: 'response not ok' };
  }

  console.log(
    `[diag-A] POST /api/out-to-session -> ok:${data.ok} hours=${data.hours ?? 'n/a'} key=${JSON.stringify(
      data.key,
    )}`,
  );

  if (!data.key) {
    return { status: 'FAIL', detail: 'missing key in response' };
  }

  return ensureCompositeUpsert([env.sessionsTable, env.reportIndexTable], data.key, 'A');
}

async function selectOutLog(env: EnvConfig): Promise<{
  record: { id: string; fields: AirtableRecordFields } | null;
  reason?: string;
}> {
  let records: { id: string; fields: AirtableRecordFields }[] = [];
  try {
    records = await getRecords<AirtableRecordFields>(env.logsTable, {
      filterByFormula: "{type}='OUT'",
      sort: [
        { field: 'timestamp', direction: 'desc' },
        { field: 'date', direction: 'desc' },
      ],
      maxRecords: 50,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { record: null, reason: `failed to load OUT logs: ${message}` };
  }

  if (records.length === 0) {
    return { record: null, reason: 'no OUT logs available' };
  }

  const prioritized = records.find((record) => {
    const machineId = readStringField(record.fields, [
      'machineId',
      'machineid',
      'machineId (from machine)',
      'machineid (from machine)',
    ]);
    return machineId === '1001';
  });

  const selected = prioritized ?? records[0];
  const fields = selected.fields;
  const hasRequired =
    typeof fields.date === 'string' &&
    typeof fields.timestamp === 'string' &&
    Array.isArray(fields.user) &&
    Array.isArray(fields.site) &&
    Array.isArray(fields.machine);

  if (!hasRequired) {
    return {
      record: null,
      reason: `selected OUT log missing required fields: ${formatLogSummary(selected)}`,
    };
  }

  return { record: selected };
}

async function runStepC(env: EnvConfig): Promise<StepResult> {
  const { record, reason } = await selectOutLog(env);
  if (!record) {
    console.warn(`[diag-B] unable to find OUT log: ${reason ?? 'unknown reason'}`);
    return { status: 'SKIP', detail: reason };
  }

  console.log(`[diag-B] pick OUT log: ${formatLogSummary(record)}`);

  const response = await postJson<OutToSessionResponse>(`${env.baseUrl}/api/out-to-session/from-logs`, {
    outLogId: record.id,
  });

  if (response.status !== 200) {
    console.error(
      `[diag-B] POST from-logs -> status=${response.status} body=${response.raw || '<empty>'}`,
    );
    return { status: 'FAIL', detail: `status ${response.status}` };
  }

  const data = response.data;
  if (!data) {
    console.error('[diag-B] empty response body');
    return { status: 'FAIL', detail: 'empty response' };
  }

  if (!data.ok) {
    console.warn(`[diag-B] from-logs returned ok=false: ${response.raw}`);
    return { status: 'SKIP', detail: data.message ?? 'from-logs skipped' };
  }

  console.log(
    `[diag-B] POST from-logs -> ok:${data.ok} hours=${data.hours ?? 'n/a'} key=${JSON.stringify(
      data.key,
    )}`,
  );

  if (!data.key) {
    return { status: 'FAIL', detail: 'missing key in response' };
  }

  return ensureCompositeUpsert([env.sessionsTable, env.reportIndexTable], data.key, 'B');
}

async function getBoundaryOutDates(env: EnvConfig): Promise<{
  from: string;
  to: string;
}> {
  const baseResult: { from: string; to: string } = {
    from: getTokyoDateString(),
    to: getTokyoDateString(),
  };

  try {
    const earliest = await getRecords<AirtableRecordFields>(env.logsTable, {
      filterByFormula: "{type}='OUT'",
      sort: [
        { field: 'date', direction: 'asc' },
        { field: 'timestamp', direction: 'asc' },
      ],
      maxRecords: 1,
    });
    if (earliest.length > 0 && typeof earliest[0].fields.date === 'string') {
      baseResult.from = earliest[0].fields.date;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[diag-C] failed to load earliest OUT log: ${message}`);
  }

  try {
    const latest = await getRecords<AirtableRecordFields>(env.logsTable, {
      filterByFormula: "{type}='OUT'",
      sort: [
        { field: 'date', direction: 'desc' },
        { field: 'timestamp', direction: 'desc' },
      ],
      maxRecords: 1,
    });
    if (latest.length > 0 && typeof latest[0].fields.date === 'string') {
      baseResult.to = latest[0].fields.date;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[diag-C] failed to load latest OUT log: ${message}`);
  }

  return baseResult;
}

async function runStepD(env: EnvConfig): Promise<StepResult> {
  const range = await getBoundaryOutDates(env);
  const response = await postJson<BackfillResponse>(`${env.baseUrl}/api/out-to-session/backfill`, range);

  if (response.status !== 200) {
    console.error(
      `[diag-C] POST backfill -> status=${response.status} body=${response.raw || '<empty>'}`,
    );
    return { status: 'FAIL', detail: `status ${response.status}` };
  }

  const data = response.data;
  if (!data || !data.ok) {
    console.error(`[diag-C] unexpected backfill response: ${response.raw || '<empty>'}`);
    return { status: 'FAIL', detail: 'response not ok' };
  }

  console.log(
    `[diag-C] backfill ${range.from}..${range.to} -> processed:${data.processed ?? 0} created:${
      data.created ?? 0
    } skipped:${data.skipped ?? 0}`,
  );

  if ((data.processed ?? 0) === 0) {
    return { status: 'WARN', detail: 'no OUT logs in range' };
  }

  return { status: 'PASS' };
}

function buildSummary(results: Record<'A' | 'B' | 'C' | 'D', StepResult>): string {
  const parts = [
    `A=${results.A.status}${results.A.detail ? `(${results.A.detail})` : ''}`,
    `B=${results.B.status}${results.B.detail ? `(${results.B.detail})` : ''}`,
    `C=${results.C.status}${results.C.detail ? `(${results.C.detail})` : ''}`,
    `D=${results.D.status}${results.D.detail ? `(${results.D.detail})` : ''}`,
  ];
  return parts.join(' ');
}

async function main(): Promise<void> {
  try {
    const env = loadEnv();
    const results: Record<'A' | 'B' | 'C' | 'D', StepResult> = {
      A: { status: 'FAIL' },
      B: { status: 'FAIL' },
      C: { status: 'FAIL' },
      D: { status: 'FAIL' },
    };

    results.A = await runStepA(env);
    if (results.A.status !== 'PASS') {
      console.error(`[diag] SUMMARY: ${buildSummary(results)}`);
      exit(1);
      return;
    }

    const today = getTokyoDateString();
    results.B = await runStepB(env, today);
    results.C = await runStepC(env);
    results.D = await runStepD(env);

    console.log(`[diag] SUMMARY: ${buildSummary(results)}`);

    if (results.B.status !== 'PASS' && results.C.status !== 'PASS') {
      exit(1);
      return;
    }

    if (results.D.status === 'FAIL') {
      exit(1);
      return;
    }

    exit(0);
  } catch (error) {
    console.error('[diag] fatal error', error);
    exit(1);
  }
}

void main();
