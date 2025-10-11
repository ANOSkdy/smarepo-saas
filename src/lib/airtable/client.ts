import { setTimeout as delay } from 'node:timers/promises';

type SortDirection = 'asc' | 'desc';

type AirtableSort = {
  field: string;
  direction?: SortDirection;
};

type ListRecordsParams = {
  table: string;
  filterByFormula?: string;
  maxRecords?: number;
  view?: string;
  fields?: string[];
  sort?: AirtableSort[];
};

type AirtableRecord<TFields> = {
  id: string;
  createdTime: string;
  fields: TFields;
};

type AirtableResponse<TFields> = {
  records: AirtableRecord<TFields>[];
  offset?: string;
};

class AirtableError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AirtableError';
  }
}

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey) {
  throw new Error('AIRTABLE_API_KEY is not configured');
}

if (!baseId) {
  throw new Error('AIRTABLE_BASE_ID is not configured');
}

const BASE_URL = `https://api.airtable.com/v0/${baseId}`;
const MAX_PAGE_SIZE = 100;

async function airtableFetch<TFields>(
  path: string,
  init: RequestInit,
  attempt = 0
): Promise<TFields> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);
  if (init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 429 && attempt < 5) {
      const wait = 2 ** attempt * 200;
      await delay(wait);
      return airtableFetch(path, init, attempt + 1);
    }
    const text = await response.text();
    throw new AirtableError(text || 'Airtable request failed', response.status);
  }

  return (await response.json()) as TFields;
}

export async function listRecords<TFields>(params: ListRecordsParams): Promise<
  AirtableRecord<TFields>[]
> {
  const {
    table,
    filterByFormula,
    maxRecords,
    view,
    fields,
    sort,
  } = params;
  const records: AirtableRecord<TFields>[] = [];
  let offset: string | undefined;
  const remaining = typeof maxRecords === 'number' ? Math.max(maxRecords, 0) : undefined;

  if (remaining === 0) {
    return records;
  }

  do {
    const url = new URL(encodeURIComponent(table), 'https://placeholder');
    const searchParams = url.searchParams;
    if (filterByFormula) {
      searchParams.set('filterByFormula', filterByFormula);
    }
    if (view) {
      searchParams.set('view', view);
    }
    if (fields?.length) {
      fields.forEach((field) => searchParams.append('fields[]', field));
    }
    if (sort?.length) {
      sort.forEach((s, index) => {
        searchParams.set(`sort[${index}][field]`, s.field);
        if (s.direction) {
          searchParams.set(`sort[${index}][direction]`, s.direction);
        }
      });
    }
    const pageSize = remaining
      ? Math.max(1, Math.min(MAX_PAGE_SIZE, remaining - records.length))
      : MAX_PAGE_SIZE;
    searchParams.set('pageSize', String(pageSize));
    if (maxRecords) {
      searchParams.set('maxRecords', String(maxRecords));
    }
    if (offset) {
      searchParams.set('offset', offset);
    }

    const pathWithQuery = `${encodeURIComponent(table)}?${searchParams.toString()}`;
    const data = await airtableFetch<AirtableResponse<TFields>>(pathWithQuery, {
      method: 'GET',
    });
    records.push(...data.records);
    offset = data.offset;
    if (remaining && records.length >= remaining) {
      break;
    }
  } while (offset);

  return records;
}

type CreateRecordParams<TFields> = {
  table: string;
  fields: TFields;
};

type UpdateRecordParams<TFields> = {
  table: string;
  recordId: string;
  fields: Partial<TFields>;
};

export async function createRecord<TFields>({
  table,
  fields,
}: CreateRecordParams<TFields>): Promise<AirtableRecord<TFields>> {
  return airtableFetch<AirtableRecord<TFields>>(`${encodeURIComponent(table)}`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

export async function updateRecord<TFields>({
  table,
  recordId,
  fields,
}: UpdateRecordParams<TFields>): Promise<AirtableRecord<TFields>> {
  return airtableFetch<AirtableRecord<TFields>>(
    `${encodeURIComponent(table)}/${recordId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    }
  );
}

export function buildAndFormula(values: Record<string, string | number | boolean>): string {
  const clauses = Object.entries(values).map(([field, value]) => {
    if (typeof value === 'string') {
      return `({${field}}='${escapeFormulaValue(value)}')`;
    }
    if (typeof value === 'boolean') {
      return `({${field}}=${value ? 'TRUE()' : 'FALSE()'})`;
    }
    return `({${field}}=${value})`;
  });
  if (clauses.length === 1) {
    return clauses[0];
  }
  return `AND(${clauses.join(',')})`;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

export type { AirtableRecord, ListRecordsParams };
export { AirtableError };
