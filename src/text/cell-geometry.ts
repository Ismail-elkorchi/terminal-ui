import { measureTextCells } from './measure.ts';
import type { TextMeasurementOptions } from './types.ts';

export type TextCellAlignment = 'start' | 'center' | 'end';

export interface PadTextCellsOptions extends TextMeasurementOptions {
  readonly align?: TextCellAlignment;
}

export function oneCellGlyph(
  preferred: string,
  fallback: string,
  options: TextMeasurementOptions = {}
): string {
  return measuredOneCellGlyph(preferred, options)
    ?? measuredOneCellGlyph(fallback, options)
    ?? ' ';
}

export function padTextCells(
  text: string,
  targetCells: number,
  options: PadTextCellsOptions = {}
): string {
  assertCellCount(targetCells, 'targetCells');
  const measured = measureTextCells(text, options);
  if (measured.cells >= targetCells) return measured.text;
  const missing = targetCells - measured.cells;
  const before = leadingPadding(missing, options.align ?? 'start');
  return `${' '.repeat(before)}${measured.text}${' '.repeat(missing - before)}`;
}

export function fillTextCells(
  pattern: string,
  targetCells: number,
  options: TextMeasurementOptions = {}
): string {
  assertCellCount(targetCells, 'targetCells');
  if (targetCells === 0) return '';
  const measured = measureTextCells(pattern, options);
  if (measured.cells === 0) return ' '.repeat(targetCells);
  const repeats = Math.floor(targetCells / measured.cells);
  const remainder = targetCells - repeats * measured.cells;
  return `${measured.text.repeat(repeats)}${' '.repeat(remainder)}`;
}

function leadingPadding(missing: number, align: TextCellAlignment): number {
  switch (align) {
    case 'start':
      return 0;
    case 'center':
      return Math.floor(missing / 2);
    case 'end':
      return missing;
  }
}

function assertCellCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

function measuredOneCellGlyph(
  candidate: string,
  options: TextMeasurementOptions
): string | undefined {
  const measured = measureTextCells(candidate, options);
  return measured.graphemes.length === 1 && measured.cells === 1
    ? measured.text
    : undefined;
}
