// lib/services/sessionWorker.ts
// OUTログをトリガに Session と ReportIndex を自動生成する軽量ワーカー
// 変更点: airtable を関数内 dynamic import 化し、トップレベル副作用を排除
/* eslint-disable @typescript-eslint/no-explicit-any */

const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS ?? 'Sessions';
const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX ?? 'ReportIndex';

const q = (v: unknown) => `'${String(v ?? '').replace(/'/g, "''")}'`; // Airtable式の単引用符エスケープ
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const toIso = (d: Date) => d.toISOString();

function toJstParts(ts: Date) {
  const jst = new Date(ts.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return { year: y, month: m, day: d, dateStr: `${y}-${mm}-${dd}` };
}

async function getAirtableBase() {
  const API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  if (!API_KEY || !BASE_ID) {
    console.error('[sessionWorker] missing env: AIRTABLE_API_KEY/AIRTABLE_BASE_ID');
    return null;
  }
  const Airtable = (await import('airtable')).default; // ← ランタイムで取り込む
  return new Airtable({ apiKey: API_KEY }).base(BASE_ID);
}

async function findRecordById(base: any, tableName: string, id: string) {
  return base(tableName).find(id);
}
async function selectAll(base: any, tableName: string, params: any) {
  return base(tableName).select(params).all();
}
type UpsertResult = { action: 'created' | 'skipped'; recordId?: string };

async function upsertByFormula(
  base: any,
  tableName: string,
  filterByFormula: string,
  fields: Record<string, any>,
): Promise<UpsertResult> {
  const exists = await selectAll(base, tableName, { filterByFormula, maxRecords: 1 });
  if (exists.length === 0) {
    const created = await base(tableName).create([{ fields }], { typecast: true });
    const record = Array.isArray(created) ? created[0] : null;
    return { action: 'created', recordId: record?.id };
  }
  const record = exists[0] ?? null;
  return { action: 'skipped', recordId: record?.id };
}

export type SessionWorkerResult =
  | { ok: true; sessionId?: string; reportId?: string; hours: number; date: string }
  | { ok: false; reason: string };

/**
 * OUTログIDを受け取り、対応する IN を突合して Session と ReportIndex を作成/確定する。
 * 失敗しても throw はせず、/api/stamp の応答遅延を避ける設計。
 */
export async function sessionWorkerCreateFromOutLog(
  outLogId: string,
): Promise<SessionWorkerResult> {
  const base = await getAirtableBase();
  if (!base) {
    return { ok: false, reason: 'NO_BASE' };
  }
  try {
    const out = await findRecordById(base, LOGS_TABLE, outLogId);
    const outType = String(out.get('type') ?? '');
    if (outType !== 'OUT') {
      console.info('[sessionWorker] skip: not OUT', { outLogId, type: outType });
      return { ok: false, reason: 'NOT_OUT' };
    }

    const outTsStr = String(out.get('timestamp') ?? '');
    const outTs = new Date(outTsStr);
    if (Number.isNaN(outTs.getTime())) {
      console.warn('[sessionWorker] skip: invalid OUT timestamp', { outLogId, outTsStr });
      return { ok: false, reason: 'INVALID_OUT_TIMESTAMP' };
    }
    const outTsIso = toIso(outTs);
    const outDateJst = toJstParts(outTs).dateStr;

    const siteName = String(out.get('siteName') ?? '');
    const workDescription = String(out.get('workDescription') ?? '');

    // Logs.userId は数値文字列（例: "115"）として格納されるため、そのまま突合キーに使う
    const userId = String(out.get('userId') ?? '');
    const userKey = userId.trim();
    if (!userKey) {
      console.info('[sessionWorker] skip: missing userId on OUT log', { outLogId });
      return { ok: false, reason: 'MISSING_USERID' };
    }
    const username = String(out.get('userName') ?? out.get('username') ?? '');
    const machineName = String(out.get('machineName') ?? out.get('machineId') ?? '');

    const isoOut = outTsIso;
    const filterParts = [
      `{type}='IN'`,
      `{userId}=${q(userKey)}`,
      `IS_BEFORE({timestamp}, DATETIME_PARSE(${q(isoOut)}))`,
    ];
    const filterByFormula = `AND(${filterParts.join(',')})`;

    const candidates = await selectAll(base, LOGS_TABLE, {
      filterByFormula,
      sort: [{ field: 'timestamp', direction: 'desc' }],
      maxRecords: 5,
      pageSize: 5,
    });
    console.info('[sessionWorker] primarySearch', { outLogId, userKey, hits: candidates.length });

    let validCandidates = candidates.filter((r: any) => {
      const ts = new Date(String(r.get('timestamp') ?? ''));
      return !Number.isNaN(ts.getTime()) && ts.getTime() <= outTs.getTime();
    });

    if (validCandidates.length === 0) {
      const twelveHoursAgoIso = toIso(
        new Date(outTs.getTime() - 12 * 60 * 60 * 1000),
      );
      const fallbackParts = [
        `{type}='IN'`,
        `{userId}=${q(userKey)}`,
        `IS_AFTER({timestamp}, DATETIME_PARSE(${q(twelveHoursAgoIso)}))`,
        `IS_BEFORE({timestamp}, DATETIME_PARSE(${q(isoOut)}))`,
      ];
      const fallbackFormula = `AND(${fallbackParts.join(',')})`;
      const fallback = await selectAll(base, LOGS_TABLE, {
        filterByFormula: fallbackFormula,
        sort: [{ field: 'timestamp', direction: 'desc' }],
        maxRecords: 1,
        pageSize: 1,
      });
      console.info('[sessionWorker] fallbackSearch', { outLogId, userKey, hits: fallback.length });
      validCandidates = fallback.filter((r: any) => {
        const ts = new Date(String(r.get('timestamp') ?? ''));
        return !Number.isNaN(ts.getTime()) && ts.getTime() <= outTs.getTime();
      });
      if (validCandidates.length === 0) {
        console.info('[sessionWorker] skip: no IN found', {
          outLogId,
          userKey,
          reason: 'NO_IN',
        });
        return { ok: false, reason: 'NO_IN' };
      }
    }

    let inRec = validCandidates.find((r: any) => {
      const ts = new Date(String(r.get('timestamp') ?? ''));
      if (Number.isNaN(ts.getTime())) return false;
      return toJstParts(ts).dateStr === outDateJst;
    });

    if (!inRec) {
      inRec = validCandidates[0];
    }

    const inTsStr = String(inRec.get('timestamp') ?? '');
    const inTs = new Date(inTsStr);
    const hours = round2(clamp((outTs.getTime() - inTs.getTime()) / 3600000, 0, 24));
    const { year, month, day, dateStr } = toJstParts(inTs);

    const sessionFields: Record<string, any> = {
      year, month, day,
      userId, username,
      sitename: siteName,
      workdescription: workDescription,
      clockInAt: toIso(inTs),
      clockOutAt: toIso(outTs),
      hours,
    };
    const sessKey =
      `AND({userId}=${q(userId)}, {clockInAt}=${q(sessionFields.clockInAt)}, {clockOutAt}=${q(sessionFields.clockOutAt)})`;
    const sessionUpsert = await upsertByFormula(base, SESSIONS_TABLE, sessKey, sessionFields);

    const reportFields: Record<string, any> = {
      date: dateStr, year, month,
      username, userId,
      sitename: siteName,
      machinename: machineName,
      workdescription: workDescription,
      clockInAt: sessionFields.clockInAt,
      clockOutAt: sessionFields.clockOutAt,
      hours,
    };
    const repKey =
      `AND({date}=${q(dateStr)}, {userId}=${q(userId)}, {sitename}=${q(siteName)}, {workdescription}=${q(workDescription)}, {clockInAt}=${q(reportFields.clockInAt)}, {clockOutAt}=${q(reportFields.clockOutAt)})`;
    const reportUpsert = await upsertByFormula(base, REPORT_INDEX_TABLE, repKey, reportFields);

    console.info('[sessionWorker] ensured Session & ReportIndex', {
      outLogId,
      userKey,
      hours,
      date: dateStr,
      sessionAction: sessionUpsert.action,
      reportAction: reportUpsert.action,
    });
    return {
      ok: true,
      sessionId: sessionUpsert.recordId,
      reportId: reportUpsert.recordId,
      hours,
      date: dateStr,
    };
  } catch (err: any) {
    console.error('[sessionWorker] failed', { outLogId, error: err?.message || String(err) });
    return { ok: false, reason: 'ERROR' };
  }
}

export async function createSessionAndIndexFromOutLog(outLogId: string): Promise<void> {
  await sessionWorkerCreateFromOutLog(outLogId);
}
