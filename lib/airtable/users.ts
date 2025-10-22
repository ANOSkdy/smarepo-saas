import { Record as AirtableRecord } from 'airtable';
import { usersTable } from '@/lib/airtable';
import type { UserFields } from '@/types';

export type UserLookupValue = {
  recordId: string;
  name: string;
  email?: string | null;
  userId?: string | null;
};

const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;

async function withRetry<T>(factory: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (attempt >= RETRY_LIMIT) {
      throw error;
    }
    const delay = RETRY_DELAY_MS * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(factory, attempt + 1);
  }
}

function normalizeKey(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

function extractUserInfo(record: AirtableRecord<UserFields>): {
  keys: string[];
  value: UserLookupValue;
} {
  const fields = record.fields as Record<string, unknown>;
  const recordId = record.id;
  const userId = typeof fields.userId === 'string' ? fields.userId : null;
  const username = typeof fields.username === 'string' ? fields.username : null;
  const emailRaw = fields.email;
  const email = typeof emailRaw === 'string' && emailRaw.length > 0 ? emailRaw : null;
  const nameField = typeof fields.name === 'string' ? fields.name : null;
  const displayName = nameField || username || '未登録ユーザー';

  const keys = new Set<string>();
  keys.add(recordId);
  if (userId) {
    const normalized = normalizeKey(userId);
    if (normalized) {
      keys.add(normalized);
      const lower = normalized.toLowerCase();
      keys.add(lower);
    }
  }
  if (username) {
    const normalized = normalizeKey(username);
    if (normalized) {
      keys.add(normalized);
      const lower = normalized.toLowerCase();
      keys.add(lower);
    }
  }
  const displayNormalized = normalizeKey(displayName);
  if (displayNormalized) {
    keys.add(displayNormalized);
    keys.add(displayNormalized.toLowerCase());
  }
  if (email) {
    const normalized = normalizeKey(email);
    if (normalized) {
      keys.add(normalized.toLowerCase());
    }
  }

  return {
    keys: Array.from(keys),
    value: { recordId, name: displayName, email, userId },
  };
}

export async function getUsersMap(): Promise<Map<string, UserLookupValue>> {
  const records = await withRetry(() =>
    usersTable
      .select({
        fields: ['userId', 'name', 'username', 'email'],
        pageSize: 100,
      })
      .all(),
  );

  const map = new Map<string, UserLookupValue>();
  for (const record of records) {
    const { keys, value } = extractUserInfo(record);
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (!normalized) continue;
      if (!map.has(normalized)) {
        map.set(normalized, value);
      }
      const lower = normalized.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, value);
      }
    }
  }

  return map;
}

export function findUserByAnyKey(
  map: Map<string, UserLookupValue>,
  raw: unknown,
): UserLookupValue | undefined {
  const normalized = normalizeKey(raw);
  if (!normalized) {
    return undefined;
  }
  return map.get(normalized) ?? map.get(normalized.toLowerCase());
}
