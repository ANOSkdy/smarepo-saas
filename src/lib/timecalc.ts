// 共通時間計算ユーティリティ（Time Calc V2）
// 仕様:
//  - 日次合計から固定90分(1.5h)控除（負値は0で打ち止め）
//  - 15分単位で丸め（既定: 最近接=四捨五入）。ENVで調整可能。
//  環境変数:
//    TIME_CALC_VERSION=2 | 1
//    TIME_CALC_ROUND_MINUTES=15
//    TIME_CALC_BREAK_MINUTES=90
//    TIME_CALC_ROUND_MODE=nearest | up | down

export type RoundMode = 'nearest' | 'up' | 'down';

export type TimeCalcConfig = {
  enabled: boolean; // V2を有効化するか（TIME_CALC_VERSION===2）
  roundMinutes: number; // 丸め単位（分）
  breakMinutes: number; // 控除分
  roundMode: RoundMode; // 丸め方式
};

const asInt = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

const asMode = (v: string | undefined, d: RoundMode): RoundMode => {
  if (v === 'nearest' || v === 'up' || v === 'down') return v;
  return d;
};

export function getTimeCalcConfig(): TimeCalcConfig {
  const v = (process.env.TIME_CALC_VERSION ?? '2').toString();
  return {
    enabled: v === '2',
    roundMinutes: Math.max(1, asInt(process.env.TIME_CALC_ROUND_MINUTES, 15)),
    breakMinutes: Math.max(0, asInt(process.env.TIME_CALC_BREAK_MINUTES, 90)),
    roundMode: asMode(process.env.TIME_CALC_ROUND_MODE, 'nearest'),
  };
}

export function roundToStep(mins: number, step: number, mode: RoundMode): number {
  if (step <= 0) return mins;
  const q = mins / step;
  if (mode === 'up') return Math.ceil(q) * step;
  if (mode === 'down') return Math.floor(q) * step;
  // nearest
  return Math.round(q) * step;
}

export function applyDailyBreak(mins: number, breakMinutes: number): number {
  // 負値は0で打ち止め
  return Math.max(0, mins - breakMinutes);
}

export function minutesFromHours(hours: number): number {
  return Math.round(hours * 60);
}

export function hoursFromMinutes(mins: number): number {
  return mins / 60;
}

export function applyTimeCalcV2FromMinutes(rawMinutes: number, cfg?: Partial<TimeCalcConfig>) {
  const c = { ...getTimeCalcConfig(), ...(cfg ?? {}) };
  if (!c.enabled) {
    return { minutes: rawMinutes, hours: hoursFromMinutes(rawMinutes) };
  }
  const afterBreak = applyDailyBreak(rawMinutes, c.breakMinutes);
  const rounded = roundToStep(afterBreak, c.roundMinutes, c.roundMode);
  return { minutes: rounded, hours: hoursFromMinutes(rounded) };
}

export function applyTimeCalcV2FromHours(rawHours: number, cfg?: Partial<TimeCalcConfig>) {
  const rawMinutes = minutesFromHours(rawHours);
  return applyTimeCalcV2FromMinutes(rawMinutes, cfg);
}

// 便宜用: 既存コードが「日次合計分」を持っている場合に一発で正規化
export function normalizeDailyMinutes(rawMinutes: number) {
  return applyTimeCalcV2FromMinutes(rawMinutes).minutes;
}

export function normalizeDailyHours(rawHours: number) {
  return applyTimeCalcV2FromHours(rawHours).hours;
}

