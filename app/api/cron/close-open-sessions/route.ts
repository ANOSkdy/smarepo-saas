import { NextResponse } from 'next/server';

// ===== 設定（ENV優先、デフォルトを用意） =====
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const TABLE_LOGS = process.env.AIRTABLE_TABLE_LOGS || 'Logs';
const FIELD_TIMESTAMP = process.env.AIRTABLE_FIELD_TIMESTAMP || 'timestamp';
const FIELD_TYPE = process.env.AIRTABLE_FIELD_TYPE || 'type';
const FIELD_USER = process.env.AIRTABLE_FIELD_USER || 'user';
const FIELD_MACHINE_ID = process.env.AIRTABLE_FIELD_MACHINE_ID || 'machineId';
const FORCED_FLAG_FIELD = process.env.FORCED_OUT_FLAG_FIELD;
const FORCED_SOURCE_FIELD = process.env.FORCED_OUT_SOURCE_FIELD;
const FORCED_SOURCE_VALUE = process.env.FORCED_OUT_SOURCE_VALUE || 'forced';

// ロジック調整値
const JST_FORCED_TIME = process.env.FORCED_OUT_JST_TIME || '17:30';
const MAX_HOURS_PER_DAY = Number(process.env.FORCED_OUT_MAX_HOURS_PER_DAY ?? 12);
const MIN_GAP_MINUTES = Number(process.env.FORCED_OUT_MIN_GAP_MINUTES ?? 5);

// ---- 全情報コピー：スナップショット＆書き戻し ----
const SNAPSHOT_ENABLE = (process.env.FORCED_OUT_SNAPSHOT_ENABLE ?? 'true').toLowerCase() === 'true';
const SNAPSHOT_FIELD = process.env.FORCED_OUT_SNAPSHOT_FIELD || 'inSnapshot';
const WRITEBACK_ENABLE = (process.env.FORCED_OUT_WRITE_BACK_FIELDS ?? 'true').toLowerCase() === 'true';
const WRITEBACK_BATCH = Math.max(1, Number(process.env.FORCED_OUT_WRITE_BACK_BATCH ?? 5));
const WRITEBACK_DELAY_MS = Math.max(0, Number(process.env.FORCED_OUT_WRITE_BACK_DELAY_MS ?? 200));
const RESERVED_KEYS = new Set([FIELD_TYPE, FIELD_TIMESTAMP, FIELD_USER, FIELD_MACHINE_ID]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ===== JSTユーティリティ =====
const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const JST_OFFSET_MS = 9 * MS_HOUR;

function toYmdJst(date = new Date()) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = `${jst.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${jst.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toIso(date: Date) {
  return date.toISOString();
}

function parseTimeJst(dateJst: string, timeHm: string) {
  const normalized = timeHm.length === 5 ? `${timeHm}:00` : timeHm;
  return new Date(`${dateJst}T${normalized}+09:00`);
}

function clampDate(date: Date, min: Date, max: Date) {
  const time = date.getTime();
  if (time < min.getTime()) return min;
  if (time > max.getTime()) return max;
  return date;
}

// ===== Airtable helpers =====
async function airtableList(formula: string) {
  const records: LogRec[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(BASE_ID)}/${encodeURIComponent(TABLE_LOGS)}`);
    url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable list error: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      records: LogRec[];
      offset?: string;
    };
    records.push(...json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

type AirtableCreatePayload = { fields: Record<string, unknown> };
type AirtableCreatedRecord = { id: string; fields: Record<string, unknown> };

async function airtableCreate(records: AirtableCreatePayload[]) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(BASE_ID)}/${encodeURIComponent(TABLE_LOGS)}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable create error: ${res.status} ${text}`);
  }
  return (await res.json()) as { records: AirtableCreatedRecord[] };
}

type AirtableUpdateResponse = { id: string; fields: Record<string, unknown> };

async function airtableUpdate(id: string, fields: Record<string, unknown>) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(BASE_ID)}/${encodeURIComponent(TABLE_LOGS)}/${encodeURIComponent(id)}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update error: ${res.status} ${text}`);
  }
  return (await res.json()) as AirtableUpdateResponse;
}

type LogRec = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

type LogWithTimestamp = {
  rec: LogRec;
  timestamp: Date;
  type: string;
};

type Candidate = {
  userKey: string;
  inRec: LogWithTimestamp;
  forcedOutAt: Date;
};

function parseTimestamp(value: unknown) {
  if (typeof value === 'string' || value instanceof String) {
    const date = new Date(value as string);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function ensureEnv() {
  if (!BASE_ID || !API_KEY) {
    throw new Error('AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set');
  }
}

function toUserKey(fields: Record<string, unknown>, fallback: string) {
  const value = fields[FIELD_USER];
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  if (typeof value === 'string' && value) {
    return value;
  }
  return `__no_user__:${fallback}`;
}

function gatherCandidates(records: LogRec[], dateJst: string, debug = false) {
  const grouped = new Map<string, LogWithTimestamp[]>();
  for (const rec of records) {
    const type = rec.fields[FIELD_TYPE];
    if (typeof type !== 'string') continue;
    const upperType = type.toUpperCase();
    if (upperType !== 'IN' && upperType !== 'OUT') continue;
    const timestamp = parseTimestamp(rec.fields[FIELD_TIMESTAMP]);
    if (!timestamp) continue;
    const userKey = toUserKey(rec.fields, rec.id);
    const list = grouped.get(userKey) ?? [];
    list.push({ rec, timestamp, type: upperType });
    grouped.set(userKey, list);
  }

  const forcedTimeBase = parseTimeJst(dateJst, JST_FORCED_TIME);
  const candidates: Candidate[] = [];
  for (const [userKey, list] of grouped) {
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const stack: LogWithTimestamp[] = [];
    for (const log of list) {
      if (log.type === 'IN') {
        stack.push(log);
      } else if (log.type === 'OUT' && stack.length > 0) {
        stack.pop();
      }
    }
    for (const inRec of stack) {
      const minDate = new Date(inRec.timestamp.getTime() + Math.max(0, MIN_GAP_MINUTES) * MS_MIN);
      const maxDate = new Date(inRec.timestamp.getTime() + Math.max(1, MAX_HOURS_PER_DAY) * MS_HOUR);
      const forced = clampDate(new Date(forcedTimeBase), minDate, maxDate);
      if (forced.getTime() <= inRec.timestamp.getTime()) {
        // fallback: ensure forced is after IN even if clamped backwards
        forced.setTime(inRec.timestamp.getTime() + MIN_GAP_MINUTES * MS_MIN);
      }
      candidates.push({ userKey, inRec, forcedOutAt: forced });
      if (debug) {
        console.log(
          `[forced-out] candidate user=${userKey} in=${inRec.rec.id} at=${inRec.timestamp.toISOString()} forced=${forced.toISOString()}`,
        );
      }
    }
  }
  return { candidates, grouped };
}

async function saveSnapshot(outId: string, inRec: LogRec, debug = false) {
  if (!SNAPSHOT_ENABLE) return { saved: false, error: null };
  try {
    await airtableUpdate(outId, { [SNAPSHOT_FIELD]: safeJson(inRec.fields) });
    if (debug) console.log(`[forced-out] snapshot saved to ${SNAPSHOT_FIELD} for ${outId}`);
    return { saved: true, error: null };
  } catch (error: unknown) {
    if (debug) console.warn(`[forced-out] snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    return { saved: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeBackAllFields(outId: string, inFields: Record<string, unknown>, debug = false) {
  if (!WRITEBACK_ENABLE) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] as string[] };
  }
  const keys = Object.keys(inFields).filter((key) => !RESERVED_KEYS.has(key));
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < keys.length; i += WRITEBACK_BATCH) {
    const slice = keys.slice(i, i + WRITEBACK_BATCH);
    const fields: Record<string, unknown> = {};
    for (const key of slice) fields[key] = inFields[key];
    attempted += slice.length;
    try {
      await airtableUpdate(outId, fields);
      succeeded += slice.length;
      if (debug) console.log(`[forced-out] writeback ok: ${slice.join(', ')} -> ${outId}`);
    } catch (error: unknown) {
      failed += slice.length;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (debug) console.warn(`[forced-out] writeback failed (${slice.join(', ')}): ${message}`);
    }
    if (WRITEBACK_DELAY_MS > 0) await sleep(WRITEBACK_DELAY_MS);
  }
  return { attempted, succeeded, failed, errors };
}

export async function GET(req: Request) {
  try {
    ensureEnv();

    const { searchParams } = new URL(req.url);
    const dateJst = searchParams.get('date') || toYmdJst();
    const dryRun = searchParams.get('dryRun') === '1';
    const debug = searchParams.get('debug') === '1';

    const formula = `DATETIME_FORMAT(SET_TIMEZONE({${FIELD_TIMESTAMP}}, 'Asia/Tokyo'), 'YYYY-MM-DD')='${dateJst}'`;
    const all = await airtableList(formula);
    if (debug) {
      console.log(`[forced-out] fetched ${all.length} records for ${dateJst}`);
    }

    const { candidates, grouped } = gatherCandidates(all, dateJst, debug);

    const created: AirtableCreatedRecord[] = [];
    let totalAttempted = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let snapshotSavedCount = 0;

    if (!dryRun) {
      for (const candidate of candidates) {
        const inFields = candidate.inRec.rec.fields;
        const payload: Record<string, unknown> = {
          [FIELD_TYPE]: 'OUT',
          [FIELD_TIMESTAMP]: toIso(candidate.forcedOutAt),
        };
        const userLink = inFields[FIELD_USER];
        if (userLink) payload[FIELD_USER] = userLink;
        if (inFields[FIELD_MACHINE_ID] != null) {
          payload[FIELD_MACHINE_ID] = inFields[FIELD_MACHINE_ID];
        }
        if (FORCED_FLAG_FIELD) payload[FORCED_FLAG_FIELD] = true;
        if (FORCED_SOURCE_FIELD) payload[FORCED_SOURCE_FIELD] = FORCED_SOURCE_VALUE;

        const res = await airtableCreate([{ fields: payload }]);
        created.push(...res.records);
        const newId = res.records[0]?.id;
        if (newId) {
          const snap = await saveSnapshot(newId, candidate.inRec.rec, debug);
          if (snap.saved) snapshotSavedCount += 1;
          const writeback = await writeBackAllFields(newId, inFields, debug);
          totalAttempted += writeback.attempted;
          totalSucceeded += writeback.succeeded;
          totalFailed += writeback.failed;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dateJst,
      totalFetched: all.length,
      users: grouped.size,
      openInCount: candidates.length,
      createdCount: dryRun ? 0 : created.length,
      dryRun,
      snapshot: SNAPSHOT_ENABLE
        ? { field: SNAPSHOT_FIELD, savedCount: snapshotSavedCount }
        : { disabled: true },
      writeback: WRITEBACK_ENABLE
        ? {
            attempted: totalAttempted,
            succeeded: totalSucceeded,
            failed: totalFailed,
            batch: WRITEBACK_BATCH,
            delayMs: WRITEBACK_DELAY_MS,
          }
        : { disabled: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

