// lib/services/sessionWorker.ts
// OUTログをトリガに Session と ReportIndex を自動生成する軽量ワーカー
// 変更点: airtable を関数内 dynamic import 化し、トップレベル副作用を排除

const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS ?? 'Session';
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
async function upsertByFormula(base: any, tableName: string, filterByFormula: string, fields: Record<string, any>) {
  const exists = await selectAll(base, tableName, { filterByFormula, maxRecords: 1 });
  if (exists.length === 0) {
    await base(tableName).create([{ fields }], { typecast: true });
    return 'created';
  }
  return 'skipped';
}

/**
 * OUTログIDを受け取り、対応する IN を突合して Session と ReportIndex を作成/確定する。
 * 失敗しても throw はせず、/api/stamp の応答遅延を避ける設計。
 */
export async function createSessionAndIndexFromOutLog(outLogId: string) {
  const base = await getAirtableBase();
  if (!base) return;
  try {
    const out = await findRecordById(base, LOGS_TABLE, outLogId);
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

    const userLink = (out.get('user') as string[] | undefined)?.[0] ?? '';
    const siteName = String(out.get('siteName') ?? '');
    const workDescription = String(out.get('workDescription') ?? '');

    const userId = String(out.get('userId') ?? '');
    const username = String(out.get('userName') ?? out.get('username') ?? '');
    const machineName = String(out.get('machineName') ?? out.get('machineId') ?? '');

    const conds = [`{type}='IN'`];
    if (userLink) conds.push(`FIND(${q(userLink)}, ARRAYJOIN({user}))`);
    if (siteName) conds.push(`{siteName}=${q(siteName)}`);
    if (workDescription) conds.push(`{workDescription}=${q(workDescription)}`);
    const filterByFormula = `AND(${conds.join(',')})`;

    const candidates = await selectAll(base, LOGS_TABLE, {
      filterByFormula,
      sort: [{ field: 'timestamp', direction: 'desc' }],
      maxRecords: 50,
      pageSize: 50,
    });

    const inRec = candidates.find((r: any) => {
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
    await upsertByFormula(base, SESSIONS_TABLE, sessKey, sessionFields);

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
    await upsertByFormula(base, REPORT_INDEX_TABLE, repKey, reportFields);

    console.info('[sessionWorker] ensured Session & ReportIndex', { outLogId, hours, date: dateStr });
  } catch (err: any) {
    console.error('[sessionWorker] failed', { outLogId, error: err?.message || String(err) });
  }
}
