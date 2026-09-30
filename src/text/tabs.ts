import { segmentGraphemesForMeasurement } from './graphemes.ts';
import type { TextMeasurementOptions } from './types.ts';

/** Distance to the next four-cell terminal tab stop. */
export function terminalTabCells(column: number): number {
  return 4 - (column % 4);
}

export function expandTerminalTabs(text: string, options: TextMeasurementOptions): string {
  if (!text.includes('\t')) return text;
  let column = 0;
  let result = '';
  for (const segment of segmentGraphemesForMeasurement(text, options)) {
    if (segment.text === '\n') {
      result += '\n';
      column = 0;
    } else if (segment.text === '\t') {
      const spaces = terminalTabCells(column);
      result += ' '.repeat(spaces);
      column += spaces;
    } else {
      result += segment.text;
      column += segment.cells;
    }
  }
  return result;
}
