export const FIELD_ALIASES = {
  userLink: ['user','User','Users','ユーザー','従業員','worker','employee'],
  userName: ['userName','name (from Users)','name_from_Users','従業員名'],
  type: ['type','Type','logType','ログ種別','種別'],
  timestamp: ['timestamp','time','日時','createdAt'],
  siteName: ['siteName','site','Site','現場名','site_name'],
} as const;

export function firstField<T = unknown>(
  get: (k: string) => unknown,
  names: string[],
): T | undefined {
  for (const n of names) {
    const v = get(n);
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length===0)) return v as T;
  }
  return undefined;
}

export function buildUserIdFilter(userRecId: string, userField: string) {
  return `FIND('${userRecId}', ARRAYJOIN({${userField}}))`;
}

export function buildUserNameFilter(userName: string, nameField: string) {
  // 完全一致 or 含有（lookupが配列の場合を考慮）
  return `OR({${nameField}}='${userName}', FIND('${userName}', ARRAYJOIN({${nameField}})))`;
}
