import {
  maximumFrameCells,
  maximumFrameColumns,
  maximumFrameRows,
} from '../renderer/internal/frame-limits.ts';
import type { TerminalSize } from '../geometry/types.ts';

export function decodeTuiTerminalSize(value: unknown): TerminalSize {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('TUI terminal size must be an object.');
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const columns = candidate['columns'];
  const rows = candidate['rows'];
  if (typeof columns !== 'number' || !Number.isSafeInteger(columns) || columns < 1
    || typeof rows !== 'number' || !Number.isSafeInteger(rows) || rows < 1) {
    throw new RangeError('TUI terminal size columns and rows must be positive safe integers.');
  }
  if (columns > maximumFrameColumns) {
    throw new RangeError(`TUI terminal size columns must not exceed ${String(maximumFrameColumns)}.`);
  }
  if (rows > maximumFrameRows) {
    throw new RangeError(`TUI terminal size rows must not exceed ${String(maximumFrameRows)}.`);
  }
  if (columns * rows > maximumFrameCells) {
    throw new RangeError(`TUI terminal size must not exceed ${String(maximumFrameCells)} cells.`);
  }
  return Object.freeze({ columns, rows });
}
