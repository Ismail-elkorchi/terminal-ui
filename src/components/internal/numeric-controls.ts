import type { NumericRange } from '../../ui-model/forms.ts';

export interface NumericControlOptions {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
}

export function validatedNumericControlRange(
  component: 'slider' | 'rangeSlider',
  options: NumericControlOptions
): NumericRange {
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new RangeError(`${component} range must have finite ordered bounds.`);
  }
  if (options.step !== undefined && (!Number.isFinite(options.step) || options.step <= 0)) {
    throw new RangeError(`${component} step must be finite and greater than zero.`);
  }
  if (options.width !== undefined && (!Number.isSafeInteger(options.width) || options.width < 1)) {
    throw new RangeError(`${component} width must be a positive safe integer.`);
  }
  return { min, max };
}

export function assertNumericControlValue(
  component: 'slider' | 'rangeSlider',
  value: number,
  range: NumericRange
): void {
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    throw new RangeError(`${component} value must be finite and contained by its range.`);
  }
}
