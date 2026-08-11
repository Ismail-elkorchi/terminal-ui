import { isNonArrayObject } from '../foundation/validation.ts';
import type { Measurement } from './contracts.ts';

const adoptedMeasurements = new WeakMap<object, Measurement>();

export function adoptMeasurement(
  value: unknown,
  owner: string
): Measurement {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} measurement must be an object.`);
  }
  const existing = adoptedMeasurements.get(value);
  if (existing !== undefined) return existing;
  const minWidth = measurementValue(value['minWidth'], owner, 'minWidth');
  const minHeight = measurementValue(value['minHeight'], owner, 'minHeight');
  const preferredWidth = measurementValue(value['preferredWidth'], owner, 'preferredWidth');
  const preferredHeight = measurementValue(value['preferredHeight'], owner, 'preferredHeight');
  const maxWidth = optionalMeasurementValue(value['maxWidth'], owner, 'maxWidth');
  const maxHeight = optionalMeasurementValue(value['maxHeight'], owner, 'maxHeight');
  assertMeasurementAxis(minWidth, preferredWidth, maxWidth, owner, 'Width');
  assertMeasurementAxis(minHeight, preferredHeight, maxHeight, owner, 'Height');
  const measurement = Object.freeze({
    minWidth,
    minHeight,
    preferredWidth,
    preferredHeight,
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(maxHeight === undefined ? {} : { maxHeight })
  });
  adoptedMeasurements.set(measurement, measurement);
  return measurement;
}

function assertMeasurementAxis(
  min: number,
  preferred: number,
  max: number | undefined,
  owner: string,
  suffix: 'Width' | 'Height'
): void {
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

function measurementValue(value: unknown, owner: string, field: string): number {
  if (isNonNegativeSafeInteger(value)) return value;
  throw new TypeError(`${owner} measurement ${field} must be a non-negative safe integer.`);
}

function optionalMeasurementValue(value: unknown, owner: string, field: string): number | undefined {
  return value === undefined ? undefined : measurementValue(value, owner, field);
}
