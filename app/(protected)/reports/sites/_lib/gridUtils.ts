export type SessionRow = {
  user?: string | number;
  machineId?: number | string | null;
  machineName?: string | null;
  durationMin?: number | null;
  hours?: number | null;
  date?: string;
};

export function toMachineHeader(rowsForUser: SessionRow[]): string {
  const uniq = new Map<string, { id?: string | number | null; name?: string | null }>();
  for (const row of rowsForUser) {
    const id = row.machineId == null ? '' : String(row.machineId);
    const name = row.machineName ?? null;
    const key = `${id}::${name ?? ''}`;
    if (!uniq.has(key)) {
      uniq.set(key, { id: id || null, name });
    }
  }
  const arr = [...uniq.values()].filter((item) => item.id || item.name);
  if (arr.length === 0) {
    return '';
  }
  if (arr.length === 1) {
    const { id, name } = arr[0];
    return `${id ?? ''}${name ? `（${name}）` : ''}`;
  }
  return '複数';
}

export function sumColumnHours(rowsForUser: SessionRow[]): number {
  let totalHours = 0;
  for (const row of rowsForUser) {
    if (typeof row.durationMin === 'number') {
      totalHours += row.durationMin / 60;
    } else if (typeof row.hours === 'number') {
      totalHours += row.hours;
    }
  }
  return Math.round(totalHours * 10) / 10;
}
