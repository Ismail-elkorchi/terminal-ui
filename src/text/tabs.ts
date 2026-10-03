import { finishWork } from '../foundation/cooperative-work.ts';
import { measuredGraphemeEvents } from './graphemes.ts';
import type { TextMeasurementOptions } from './types.ts';

/** Distance to the next four-cell terminal tab stop. */
export function terminalTabCells(column: number): number {
  return 4 - (column % 4);
}

export function expandTerminalTabs(text: string, options: TextMeasurementOptions): string {
  return finishWork(expandTerminalTabsWork(text, options));
}

export function* expandTerminalTabsWork(text: string, options: TextMeasurementOptions): Generator<number, string> {
  const hasTabs = text.includes('\t');
  yield text.length;
  if (!hasTabs) return text;
  let column = 0;
  let result = '';
  let units = 0;
  for (const segment of measuredGraphemeEvents(text, options)) {
    if (typeof segment === 'number') { yield segment; continue; }
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
    if (units >= 256) { yield units; units = 0; }
  }
  if (units !== 0) yield units;
  return result;
}
