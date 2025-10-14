import type { FieldSet, Record as AirtableRecord } from 'airtable';
import type { LogFields } from '@/types';

type AirtableLikeRecord =
  | { fields?: Record<string, unknown> }
  | AirtableRecord<FieldSet>
  | AirtableRecord<LogFields>;

type Identity = {
  employeeCode?: string;
  userRecId?: string;
  username?: string;
  displayName?: string;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeString(item);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function findFieldByKeywords(fields: Record<string, unknown>, keywords: string[]): string | undefined {
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keywords.some((keyword) => normalizedKey.includes(keyword))) {
      const normalizedValue = normalizeString(value);
      if (normalizedValue) {
        return normalizedValue;
      }
    }
  }
  return undefined;
}

export function resolveUserIdentity(record: AirtableLikeRecord): Identity {
  const fields = (record && 'fields' in record ? record.fields : undefined) ?? {};

  const userLinks = Array.isArray((fields as Record<string, unknown>).user)
    ? ((fields as Record<string, unknown>).user as unknown[])
    : [];
  const userRecId = normalizeString(userLinks[0]);

  const employeeCode =
    findFieldByKeywords(fields as Record<string, unknown>, [
      'employeecode',
      'employeenumber',
      'employeeno',
      'staffcode',
    ]) ?? normalizeString((fields as Record<string, unknown>)['userId']);

  const username =
    normalizeString((fields as Record<string, unknown>)['username']) ??
    findFieldByKeywords(fields as Record<string, unknown>, ['userid', 'loginid']);

  const displayName =
    normalizeString((fields as Record<string, unknown>)['userName']) ??
    normalizeString((fields as Record<string, unknown>)['name']);

  return {
    employeeCode: employeeCode ?? undefined,
    userRecId: userRecId ?? undefined,
    username: username ?? undefined,
    displayName: displayName ?? undefined,
  };
}

export function resolveUserKey(record: AirtableLikeRecord): string {
  const identity = resolveUserIdentity(record);
  return (
    identity.employeeCode ||
    identity.userRecId ||
    identity.username ||
    'unknown'
  );
}
