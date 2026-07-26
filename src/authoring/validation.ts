import { isStringMember } from '../foundation/validation.ts';

export function assertOptionalEnum<TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  label: string
): asserts value is TValue | undefined {
  if (value === undefined || isStringMember(value, values)) return;
  throw new TypeError(`${label} must be one of ${values.join(', ')}.`);
}

export function assertOptionalFiniteNumber(value: unknown, label: string): asserts value is number | undefined {
  if (value === undefined || (typeof value === 'number' && Number.isFinite(value))) return;
  throw new RangeError(`${label} must be finite when provided.`);
}

export function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value === 'number' && Number.isFinite(value)) return;
  throw new RangeError(`${label} must be finite.`);
}
