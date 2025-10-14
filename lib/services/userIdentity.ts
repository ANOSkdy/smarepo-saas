export type LogRec = { id: string; fields: Record<string, unknown> };

/**
 * Logsレコードからユーザーを堅牢に解決する。
 * - employeeCode: 従業員コード（例 "115"）… {userId} or {userId (from user)}
 * - userRecId: UsersリンクのrecID … {user}[0]
 */
export function resolveUserIdentity(log: LogRec | null | undefined): {
  employeeCode?: string;
  userRecId?: string;
} {
  if (!log) {
    return {};
  }

  const f: Record<string, unknown> = log.fields ?? {};
  const normStr = (value: unknown): string | undefined => {
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }
    return undefined;
  };

  const employeeCode = normStr(f['userId']) ?? normStr(f['userId (from user)']);

  const userField = f['user'];
  const userRecId =
    Array.isArray(userField) && userField[0] != null ? String(userField[0]) : undefined;

  return {
    employeeCode: employeeCode || undefined,
    userRecId: userRecId || undefined,
  };
}

export function hasUserIdentity(
  identity?: { employeeCode?: string; userRecId?: string },
): boolean {
  if (!identity) {
    return false;
  }
  return Boolean(identity.employeeCode || identity.userRecId);
}
