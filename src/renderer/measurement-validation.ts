import { isNonArrayObject } from '../foundation/validation.ts';
import type { Measurement } from './contracts.ts';

export function assertValidMeasurement(
  value: unknown,
  owner: string
): asserts value is Measurement {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} measurement must be an object.`);
  }
  for (const field of ['minWidth', 'minHeight', 'preferredWidth', 'preferredHeight'] as const) {
    if (!isNonNegativeSafeInteger(value[field])) {
      throw new TypeError(`${owner} measurement ${field} must be a non-negative safe integer.`);
    }
  }
  for (const field of ['maxWidth', 'maxHeight'] as const) {
    if (value[field] !== undefined && !isNonNegativeSafeInteger(value[field])) {
      throw new TypeError(`${owner} measurement ${field} must be a non-negative safe integer.`);
    }
  }
  assertMeasurementAxis(value, owner, 'Width');
  assertMeasurementAxis(value, owner, 'Height');
}

function assertMeasurementAxis(
  value: Readonly<Record<string, unknown>>,
  owner: string,
  suffix: 'Width' | 'Height'
): void {
  const min = value[`min${suffix}`] as number;
  const preferred = value[`preferred${suffix}`] as number;
  const max = value[`max${suffix}`] as number | undefined;
  if (preferred < min) {
    throw new RangeError(`${owner} preferred${suffix} must not be less than min${suffix}.`);
  }
  if (max !== undefined && (max < min || preferred > max)) {
    throw new RangeError(
      `${owner} ${suffix.toLowerCase()} measurement must satisfy min <= preferred <= max.`
    );
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
