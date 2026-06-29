import { measureTextCells } from './measure.ts';
import type { TextMeasurementOptions } from './types.ts';

export function terminalTextWidth(text: string, options: TextMeasurementOptions = {}): number {
  return measureTextCells(text, options).cells;
}
