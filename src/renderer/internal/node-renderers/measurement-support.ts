import type { Measurement } from '../../contracts.ts';

export function childMeasurements(
  childCount: number,
  measureChild: (index: number) => Measurement
): readonly Measurement[] {
  return Array.from({ length: childCount }, (_value, index) => measureChild(index));
}
