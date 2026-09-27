import { measuredGraphemes, segmentGraphemesForMeasurement } from './graphemes.ts';
import { measureTextCells } from './measure.ts';
import { sanitizeTerminalText } from './sanitize.ts';
import type { TextLine, TextMeasurementOptions, TextWrapOptions } from './types.ts';

/** Geometry-only wrapping, without retaining off-screen strings or grapheme arrays. */
export function countWrappedTextRows(text: string, width: number, options: TextMeasurementOptions): number {
  if (width <= 0) throw new RangeError('width must be positive.');
  let rows = 0;
  for (const line of sanitizeTerminalText(text).text.split('\n')) {
    if (/^[\x20-\x7e]*$/u.test(line)) {
      rows += Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(width))));
      continue;
    }
    rows += 1;
    let cells = 0;
    for (const segment of measuredGraphemes(line, options)) {
      if (cells > 0 && cells + segment.cells > width) {
        rows += 1;
        cells = 0;
      }
      cells += segment.cells;
    }
  }
  return rows;
}

export function wrapTextCells(
  text: string,
  width: number,
  options: TextWrapOptions = {}
): readonly TextLine[] {
  if (width <= 0) throw new RangeError('width must be positive.');
  const lines: TextLine[] = [];
  for (const rawLine of sanitizeTerminalText(text).text.split('\n')) {
    lines.push(...wrapLineCells(rawLine, width, options));
  }
  return lines;
}

function wrapLineCells(line: string, width: number, options: TextWrapOptions): readonly TextLine[] {
  const lines: TextLine[] = [];
  const preserveWords = options.preserveWords === true;
  let current = '';
  let cells = 0;
  for (const segment of segmentGraphemesForMeasurement(line, options)) {
    if (cells > 0 && cells + segment.cells > width) {
      if (preserveWords && /^\s+$/u.test(segment.text)) {
        lines.push({ text: current, cells, hardBreak: false });
        current = '';
        cells = 0;
        continue;
      }
      const split = preserveWords ? wordSplit(current) : undefined;
      if (split !== undefined) {
        lines.push({ text: split.line, cells: measureTextCells(split.line, options).cells, hardBreak: false });
        current = `${split.rest}${segment.text}`;
        cells = measureTextCells(current, options).cells;
        continue;
      }
      lines.push({ text: current, cells, hardBreak: false });
      current = '';
      cells = 0;
    }
    current += segment.text;
    cells += segment.cells;
  }
  lines.push({ text: current, cells, hardBreak: true });
  return lines;
}

function wordSplit(text: string): { readonly line: string; readonly rest: string } | undefined {
  const match = /^(.*\S)\s+(\S*)$/u.exec(text);
  if (match?.[1] === undefined || match[2] === undefined || match[1].length === 0) return undefined;
  return { line: match[1], rest: match[2] };
}
