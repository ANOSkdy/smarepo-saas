export type MachineLabelProps = {
  id?: number | string | null;
  name?: string | null;
  className?: string;
  prefix?: string;
};

function normalize(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = typeof value === 'number' ? String(value) : value;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function MachineLabel({ id, name, className, prefix = '機械' }: MachineLabelProps) {
  const normalizedId = normalize(id ?? null);
  const normalizedName = normalize(name ?? null);

  if (!normalizedId && !normalizedName) {
    return null;
  }

  const baseClass = 'text-sm text-muted-foreground';
  const resolvedClass = className ? `${baseClass} ${className}` : baseClass;

  return (
    <p className={resolvedClass}>
      {prefix}
      {'　'}
      {normalizedId ?? ''}
      {normalizedName ? `（${normalizedName}）` : ''}
    </p>
  );
}
