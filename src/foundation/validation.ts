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

export function assertOptionalEnum<TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  label: string
): asserts value is TValue | undefined {
  if (value === undefined || isStringMember(value, values)) return;
  throw new TypeError(`${label} must be one of ${values.join(', ')}.`);
}

export function assertOptionalFiniteNumber(
  value: unknown,
  label: string
): asserts value is number | undefined {
  if (value === undefined || (typeof value === 'number' && Number.isFinite(value))) return;
  throw new RangeError(`${label} must be finite when provided.`);
}

export function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value === 'number' && Number.isFinite(value)) return;
  throw new RangeError(`${label} must be finite.`);
}

export function finiteNonNegativeIntegerOrZero(value: number | undefined): number {
  return finiteNonNegativeIntegerOr(value, 0);
}

export function finiteNonNegativeIntegerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}
