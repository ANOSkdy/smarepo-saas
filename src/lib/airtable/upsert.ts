import { buildAndFormula, createRecord, listRecords, updateRecord } from './client';

type UpsertParams<TFields extends Record<string, unknown>> = {
  table: string;
  key: Record<string, string | number | boolean>;
  payload: TFields;
};

type UpsertResult<TFields> = {
  id: string;
  fields: TFields;
};

export async function upsertByCompositeKey<TFields extends Record<string, unknown>>({
  table,
  key,
  payload,
}: UpsertParams<TFields>): Promise<UpsertResult<TFields>> {
  const filterFormula = buildAndFormula(key);
  const existing = await listRecords<TFields>({
    table,
    filterByFormula: filterFormula,
    maxRecords: 1,
  });

  if (existing.length === 0) {
    const created = await createRecord<TFields>({
      table,
      fields: payload,
    });
    return { id: created.id, fields: created.fields };
  }

  const [record] = existing;
  const updated = await updateRecord<TFields>({
    table,
    recordId: record.id,
    fields: payload,
  });
  return { id: updated.id, fields: updated.fields };
}
