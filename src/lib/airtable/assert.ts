import { setTimeout as delay } from 'node:timers/promises';
import {
  buildAndFormula,
  listRecords,
  type AirtableRecord,
  type ListRecordsParams,
} from './client';

export type CompositeSessionKey = {
  date: string;
  userId: string;
  siteId: string;
  machineId: string;
  workdescription: string;
};

const MIN_SLEEP_MS = 150;

type GetRecordsOptions = Omit<ListRecordsParams, 'table'>;

export async function sleep(durationMs: number): Promise<void> {
  const wait = Number.isFinite(durationMs) ? Math.max(durationMs, MIN_SLEEP_MS) : MIN_SLEEP_MS;
  await delay(wait);
}

export async function getRecords<TFields>(
  table: string,
  options: GetRecordsOptions = {},
): Promise<AirtableRecord<TFields>[]> {
  await sleep(MIN_SLEEP_MS);
  return listRecords<TFields>({
    ...options,
    table,
  });
}

export function buildCompositeKeyFormula(key: CompositeSessionKey): string {
  return buildAndFormula({
    date: key.date,
    userId: key.userId,
    siteId: key.siteId,
    machineId: key.machineId,
    workdescription: key.workdescription,
  });
}

export async function findOneByCompositeKey<TFields>(
  table: string,
  key: CompositeSessionKey,
): Promise<AirtableRecord<TFields> | null> {
  const [record] = await getRecords<TFields>(table, {
    filterByFormula: buildCompositeKeyFormula(key),
    maxRecords: 1,
  });
  return record ?? null;
}
