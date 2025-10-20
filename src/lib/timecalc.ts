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

const asInt = (value: string | undefined, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const asMode = (value: string | undefined, defaultValue: RoundMode): RoundMode => {
  if (value === 'nearest' || value === 'up' || value === 'down') {
    return value;
  }
  return defaultValue;
};

export function getTimeCalcConfig(): TimeCalcConfig {
  const version = (process.env.TIME_CALC_VERSION ?? '2').toString();
  return {
    enabled: version === '2',
    roundMinutes: asInt(process.env.TIME_CALC_ROUND_MINUTES, 15),
    breakMinutes: asInt(process.env.TIME_CALC_BREAK_MINUTES, 90),
    roundMode: asMode(process.env.TIME_CALC_ROUND_MODE, 'nearest'),
  };
}

export function roundToStep(mins: number, step: number, mode: RoundMode): number {
  if (step <= 0) {
    return mins;
  }
  const quotient = mins / step;
  if (mode === 'up') {
    return Math.ceil(quotient) * step;
  }
  if (mode === 'down') {
    return Math.floor(quotient) * step;
  }
  return Math.round(quotient) * step;
}

export function applyDailyBreak(mins: number, breakMinutes: number): number {
  return Math.max(0, mins - breakMinutes);
}

export function minutesFromHours(hours: number): number {
  return Math.round(hours * 60);
}

export function hoursFromMinutes(mins: number): number {
  return mins / 60;
}

export function applyTimeCalcV2FromMinutes(rawMinutes: number, override?: Partial<TimeCalcConfig>) {
  const config = { ...getTimeCalcConfig(), ...(override ?? {}) };
  if (!config.enabled) {
    return { minutes: rawMinutes, hours: hoursFromMinutes(rawMinutes) };
  }
  const afterBreak = applyDailyBreak(rawMinutes, config.breakMinutes);
  const rounded = roundToStep(afterBreak, config.roundMinutes, config.roundMode);
  return { minutes: rounded, hours: hoursFromMinutes(rounded) };
}

export function applyTimeCalcV2FromHours(rawHours: number, override?: Partial<TimeCalcConfig>) {
  const rawMinutes = minutesFromHours(rawHours);
  return applyTimeCalcV2FromMinutes(rawMinutes, override);
}

export function normalizeDailyMinutes(rawMinutes: number) {
  return applyTimeCalcV2FromMinutes(rawMinutes).minutes;
}

export function normalizeDailyHours(rawHours: number) {
  return applyTimeCalcV2FromHours(rawHours).hours;
}
