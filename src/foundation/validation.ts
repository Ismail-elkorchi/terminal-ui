export function isNonArrayObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isStringMember<TValue extends string>(
  value: unknown,
  values: readonly TValue[]
): value is TValue {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function finiteNonNegativeIntegerOrZero(value: number | undefined): number {
  return finiteNonNegativeIntegerOr(value, 0);
}

export function finiteNonNegativeIntegerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}
