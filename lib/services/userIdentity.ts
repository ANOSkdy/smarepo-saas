export type LogRec = { id: string; fields: Record<string, unknown> | undefined };

const DIRECT_ALIASES = [
  'userId',
  'employeeCode',
  '社員番号',
  '社員コード',
  'ユーザーID',
] as const;

const LOOKUP_ALIASES = [
  'userId (from user)',
  'employeeCode (from user)',
  '社員番号 (from user)',
  '社員コード (from user)',
  'ユーザーID (from user)',
] as const;

function normalizeToString(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeToString(entry);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function pickFirstAvailable(fields: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      continue;
    }
    const value = normalizeToString(fields[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveUserIdentity(log: LogRec | undefined): { employeeCode?: string; userRecId?: string } {
  const fields = log?.fields;
  if (!fields) {
    return {};
  }

  const employeeCode = pickFirstAvailable(fields, DIRECT_ALIASES) ?? pickFirstAvailable(fields, LOOKUP_ALIASES);

  let userRecId: string | undefined;
  const userField = fields['user'];
  if (Array.isArray(userField)) {
    for (const entry of userField) {
      const normalized = normalizeToString(entry);
      if (normalized) {
        userRecId = normalized;
        break;
      }
    }
  } else {
    const normalized = normalizeToString(userField);
    if (normalized) {
      userRecId = normalized;
    }
  }

  return {
    employeeCode: employeeCode || undefined,
    userRecId: userRecId || undefined,
  };
}

export function hasUserIdentity(u?: { employeeCode?: string; userRecId?: string }) {
  return !!(u && (u.employeeCode || u.userRecId));
}
