// lib/services/sessionWorker.ts
// OUTログをトリガに Session と ReportIndex を自動生成する軽量ワーカー
// 依存: airtable (^0.12.x)

import Airtable from 'airtable';

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS ?? 'Session';
const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX ?? 'ReportIndex';

// 必須ENVが無い場合は実行しない（/api/stamp の応答は妨げない）
function canRun(): boolean {
  if (!API_KEY || !BASE_ID) {
    console.error('[sessionWorker] missing env: AIRTABLE_API_KEY/AIRTABLE_BASE_ID');
    return false;
  }
  return true;
}

const base = API_KEY && BASE_ID ? new Airtable({ apiKey: API_KEY }).base(BASE_ID) : null;

// Airtable 公式の filterByFormula で使用する値の単引用符エスケープ
const q = (v: unknown) => `'${String(v ?? '').replace(/'/g, "''")}'`;

// 端数処理
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const toIso = (d: Date) => d.toISOString();

// JST (+09:00) で年月日を算出（DSTなし）
function toJstParts(ts: Date) {
  const jst = new Date(ts.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return { year: y, month: m, day: d, dateStr: `${y}-${mm}-${dd}` };
}

// ---- 内部ユーティリティ ----
async function findRecordById(tableName: string, id: string) {
  if (!base) throw new Error('Airtable base not initialized');
  return (base as any)(tableName).find(id);
}

async function selectAll(tableName: string, params: Airtable.SelectOptions) {
  if (!base) throw new Error('Airtable base not initialized');
  return (base as any)(tableName).select(params).all();
}

async function upsertByFormula(tableName: string, filterByFormula: string, fields: Record<string, any>) {
  const exists = await selectAll(tableName, { filterByFormula, maxRecords: 1 });
  if (exists.length === 0) {
    if (!base) throw new Error('Airtable base not initialized');
    await (base as any)(tableName).create([{ fields }], { typecast: true });
    return 'created';
  }
  return 'skipped';
}

// ---- 公開関数 ----
/**
 * OUTログIDを受け取り、対応する IN を突合して Session と ReportIndex を自動作成する。
 * 失敗しても throw はせず、/api/stamp の応答遅延を避ける設計。
 */
export async function createSessionAndIndexFromOutLog(outLogId: string) {
  if (!canRun()) return;
  try {
    const out = await findRecordById(LOGS_TABLE, outLogId);
    const outType = String(out.get('type') ?? '');
    if (outType !== 'OUT') {
      console.info('[sessionWorker] skip: not OUT', { outLogId, type: outType });
      return;
    }

    const outTsStr = String(out.get('timestamp') ?? '');
    const outTs = new Date(outTsStr);
    if (Number.isNaN(outTs.getTime())) {
      console.warn('[sessionWorker] skip: invalid OUT timestamp', { outLogId, outTsStr });
      return;
    }

    // 参照キー
    const userLink = (out.get('user') as string[] | undefined)?.[0] ?? ''; // Link to Users
    const siteName = String(out.get('siteName') ?? '');
    const workDescription = String(out.get('workDescription') ?? '');

    // 表示系（Session/ReportIndexで使用）
    const userId = String(out.get('userId') ?? ''); // 任意（文字列ID）
    const username = String(out.get('userName') ?? out.get('username') ?? '');
    const machineName = String(out.get('machineName') ?? out.get('machineId') ?? '');

    // 同一ユーザー（+同一現場/作業ならそれも）で、OUT以前の最新INを検索
    const conds = [`{type}='IN'`];
    if (userLink) conds.push(`FIND(${q(userLink)}, ARRAYJOIN({user}))`);
    if (siteName) conds.push(`{siteName}=${q(siteName)}`);
    if (workDescription) conds.push(`{workDescription}=${q(workDescription)}`);
    const filterByFormula = `AND(${conds.join(',')})`;

    const candidates = await selectAll(LOGS_TABLE, {
      filterByFormula,
      sort: [{ field: 'timestamp', direction: 'desc' }],
      maxRecords: 50,
      pageSize: 50,
    });

    const inRec = candidates.find((r) => {
      const ts = new Date(String(r.get('timestamp') ?? ''));
      return !Number.isNaN(ts.getTime()) && ts.getTime() <= outTs.getTime();
    });

    if (!inRec) {
      console.info('[sessionWorker] skip: no IN found', { outLogId, conds });
      return;
    }

    const inTsStr = String(inRec.get('timestamp') ?? '');
    const inTs = new Date(inTsStr);
    const hours = round2(clamp((outTs.getTime() - inTs.getTime()) / 3600000, 0, 24));

    const { year, month, day, dateStr } = toJstParts(inTs); // IN基準

    // ---- Session upsert（userId + clockInAt + clockOutAt）
    const sessionFields: Record<string, any> = {
      year,
      month,
      day,
      userId,
      username,
      sitename: siteName,
      workdescription: workDescription,
      clockInAt: toIso(inTs),
      clockOutAt: toIso(outTs),
      hours,
    };
    const sessKey = `AND({userId}=${q(userId)}, {clockInAt}=${q(sessionFields.clockInAt)}, {clockOutAt}=${q(sessionFields.clockOutAt)})`;
    await upsertByFormula(SESSIONS_TABLE, sessKey, sessionFields);

    // ---- ReportIndex upsert（date + userId + sitename + workdescription + in/out 一意）
    const reportFields: Record<string, any> = {
      date: dateStr,
      year,
      month,
      username,
      userId,
      sitename: siteName,
      machinename: machineName,
      workdescription: workDescription,
      clockInAt: sessionFields.clockInAt,
      clockOutAt: sessionFields.clockOutAt,
      hours,
    };
    const repKey = `AND({date}=${q(dateStr)}, {userId}=${q(userId)}, {sitename}=${q(siteName)}, {workdescription}=${q(workDescription)}, {clockInAt}=${q(reportFields.clockInAt)}, {clockOutAt}=${q(reportFields.clockOutAt)})`;
    await upsertByFormula(REPORT_INDEX_TABLE, repKey, reportFields);

    console.info('[sessionWorker] ensured Session & ReportIndex', {
      outLogId,
      hours,
      date: dateStr,
    });
  } catch (err: any) {
    console.error('[sessionWorker] failed', {
      outLogId,
      error: err?.message || String(err),
    });
  }
}
