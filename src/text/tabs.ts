import { finishWork } from '../foundation/cooperative-work.ts';
import { measuredGraphemes } from './graphemes.ts';
import type { TextMeasurementOptions } from './types.ts';

/** Distance to the next four-cell terminal tab stop. */
export function terminalTabCells(column: number): number {
  return 4 - (column % 4);
}

export function expandTerminalTabs(text: string, options: TextMeasurementOptions): string {
  return finishWork(expandTerminalTabsWork(text, options));
}

export function* expandTerminalTabsWork(text: string, options: TextMeasurementOptions): Generator<void, string> {
  if (!text.includes('\t')) return text;
  let column = 0;
  let result = '';
  let units = 0;
  for (const segment of measuredGraphemes(text, options)) {
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
    units += segment.text.length;
    if (units >= 2048) { units = 0; yield; }
  }
  return result;
}
