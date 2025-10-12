import type { FieldSet, Table } from 'airtable';
import { getBase } from '../airtable';

interface UpsertResult {
  upserted: 'create' | 'update';
  id: string;
}

/**
 * ReportIndex を date 単位で upsert する軽量ユーティリティ。
 * 期待カラム：date (YYYY-MM-DD), year (number), month (number)
 * ※ 追加のカラムがあっても無視されるよう最小フィールドで書き込む。
 */
export async function upsertReportIndexByDate(jstDate: string): Promise<UpsertResult> {
  const base = getBase();
  const tableName = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';
  const [year, month] = jstDate.split('-').map((value) => Number(value));

  const table = base(tableName) as Table<FieldSet>;
  const existing = await table
    .select({
      filterByFormula: `{date} = '${jstDate}'`,
      maxRecords: 1,
    })
    .firstPage();

  const fields: FieldSet = {
    date: jstDate,
    year,
    month,
  };

  if (existing.length > 0) {
    await table.update(existing[0].id, fields, { typecast: true });
    return { upserted: 'update', id: existing[0].id };
  }

  const created = await table.create([{ fields }], { typecast: true });
  return { upserted: 'create', id: created[0].id };
}
