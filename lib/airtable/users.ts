import { Record as AirtableRecord } from 'airtable';
import { usersTable } from '@/lib/airtable';
import type { UserFields } from '@/types';

export type UserLookupValue = {
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

  const keys = [recordId];
  if (userId) {
    keys.push(userId);
  }
  if (username) {
    keys.push(username);
  }
  if (email) {
    keys.push(email.toLowerCase());
  }

  return {
    keys,
    value: { name: displayName, email, userId },
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
      if (!key) continue;
      if (!map.has(key)) {
        map.set(String(key), value);
      }
    }
  }

  return map;
}
