export type LocationErrorReason =
  | 'unsupported'
  | 'insecure'
  | 'permission'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export const describeLocationError = (reason: LocationErrorReason): string => {
  switch (reason) {
    case 'unsupported':
      return 'この端末では位置情報が利用できません。';
    case 'insecure':
      return '位置情報はHTTPS接続でのみ取得できます。';
    case 'permission':
      return '位置情報の利用が許可されていません。設定を確認してください。';
    case 'unavailable':
      return '位置情報を取得できません（電波状況などをご確認ください）。';
    case 'timeout':
      return '位置情報の取得がタイムアウトしました。';
    default:
      return '不明なエラーが発生しました。';
  }
};

export class LocationError extends Error {
  readonly reason: LocationErrorReason;

  constructor(reason: LocationErrorReason, message?: string) {
    super(message ?? describeLocationError(reason));
    this.name = 'LocationError';
    this.reason = reason;
  }
}

const GEO_ERROR_CODE_TO_REASON: Record<number, LocationErrorReason> = {
  1: 'permission',
  2: 'unavailable',
  3: 'timeout',
};

export const createLocationErrorFromCode = (code: number): LocationError => {
  const reason = GEO_ERROR_CODE_TO_REASON[code] ?? 'unknown';
  return new LocationError(reason);
};

export const normalizeToLocationError = (error: unknown): LocationError => {
  if (error instanceof LocationError) {
    return error;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    return createLocationErrorFromCode((error as { code: number }).code);
  }
  return new LocationError('unknown');
};
