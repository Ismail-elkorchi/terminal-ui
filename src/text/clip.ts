import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { measureTextCells } from './measure.ts';
import { sanitizeTerminalText } from './sanitize.ts';
import type { TextClipOptions, TextClipResult, TextMeasurementOptions } from './types.ts';

export function clipTextCells(
  text: string,
  maxCells: number,
  options: TextClipOptions = {}
): TextClipResult {
  if (maxCells < 0) throw new RangeError('maxCells must be non-negative.');
  const ellipsis = options.ellipsis ?? '';
  const ellipsisCells = measureTextCells(ellipsis).cells;
  const fittedEllipsis = ellipsisCells <= maxCells
    ? ellipsis
    : takeCells(ellipsis, maxCells, options).text;
  const fittedEllipsisCells = measureTextCells(fittedEllipsis, options).cells;
  const budget = Math.max(0, maxCells - fittedEllipsisCells);
  let cells = 0;
  let output = '';
  for (const segment of segmentGraphemesForMeasurement(sanitizeTerminalText(text).text, options)) {
    if (cells + segment.cells > budget) {
      const clippedText = `${output}${fittedEllipsis}`;
      return { text: clippedText, cells: measureTextCells(clippedText, options).cells, clipped: true };
    }
    output += segment.text;
    cells += segment.cells;
  }
  return { text: output, cells, clipped: false };
}

function takeCells(text: string, maxCells: number, options: TextMeasurementOptions): TextClipResult {
  let output = '';
  let cells = 0;
  for (const segment of segmentGraphemesForMeasurement(sanitizeTerminalText(text).text, options)) {
    if (cells + segment.cells > maxCells) return { text: output, cells, clipped: true };
    output += segment.text;
    cells += segment.cells;
  }
  return { text: output, cells, clipped: false };
}
