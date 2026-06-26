import { measureTextCells } from '../text/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { FocusPath } from './focus.ts';

export interface Frame {
  readonly schemaVersion: 'terminal-ui.tui-frame.v1';
  readonly width: number;
  readonly height: number;
  readonly cells: readonly FrameCell[];
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility: AccessibleSnapshot;
}

export interface FrameCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
}

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
}

export type { FocusPath } from './focus.ts';

export interface RenderDiff {
  readonly schemaVersion: 'terminal-ui.render-diff.v1';
  readonly width: number;
  readonly height: number;
  readonly operations: readonly RenderOperation[];
  readonly fullRewrite: boolean;
}

export type RenderOperation =
  | { readonly kind: 'write'; readonly row: number; readonly column: number; readonly text: string }
  | { readonly kind: 'clearLine'; readonly row: number }
  | { readonly kind: 'moveCursor'; readonly row: number; readonly column: number }
  | { readonly kind: 'showCursor'; readonly visible: boolean };

export interface RenderFrameOptions {
  readonly includeControlSequences?: boolean;
}

export function renderFrame(frame: Frame, options: RenderFrameOptions = {}): string {
  if (options.includeControlSequences === true) return renderFrameControlSequences(frame);
  const rows = Array.from({ length: frame.height }, (_value, index) => rowTextFromCells(frame, index + 1));
  return trimTrailingEmptyRows(rows).join('\n');
}

export function diffFrames(previous: Frame | undefined, next: Frame): RenderDiff {
  if (previous?.width !== next.width || previous.height !== next.height) {
    return {
      schemaVersion: 'terminal-ui.render-diff.v1',
      width: next.width,
      height: next.height,
      operations: [{ kind: 'write', row: 1, column: 1, text: renderFrame(next) }],
      fullRewrite: true
    };
  }

  const before = cellMap(previous);
  const after = cellMap(next);
  const operations: RenderOperation[] = [];
  const changedRows = new Set<number>();

  for (const [key, beforeCell] of before) {
    const afterCell = after.get(key);
    if (afterCell?.text !== beforeCell.text) {
      changedRows.add(beforeCell.row);
    }
  }
  for (const [key, afterCell] of after) {
    const beforeCell = before.get(key);
    if (beforeCell?.text !== afterCell.text) {
      changedRows.add(afterCell.row);
    }
  }

  for (const row of [...changedRows].sort((left, right) => left - right)) {
    operations.push({ kind: 'clearLine', row });
    const rowText = rowTextFromCells(next, row);
    if (rowText.length > 0) operations.push({ kind: 'write', row, column: 1, text: rowText });
  }

  if (next.cursor !== undefined) {
    operations.push({ kind: 'moveCursor', row: next.cursor.row, column: next.cursor.column });
  }

  return { schemaVersion: 'terminal-ui.render-diff.v1', width: next.width, height: next.height, operations, fullRewrite: false };
}

export function renderDiff(diff: RenderDiff): string {
  return diff.operations.map(renderOperation).join('');
}

export function compareCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}

function renderFrameControlSequences(frame: Frame): string {
  const writes = frame.cells
    .filter((cell) => cell.row >= 1 && cell.row <= frame.height && cell.column >= 1 && cell.column <= frame.width)
    .sort(compareCells)
    .map((cell) => `\u001B[${String(cell.row)};${String(cell.column)}H${cell.text}`)
    .join('');
  const cursor = frame.cursor === undefined
    ? ''
    : `\u001B[${String(frame.cursor.row)};${String(frame.cursor.column)}H`;
  return `${writes}${cursor}`;
}

function renderOperation(operation: RenderOperation): string {
  switch (operation.kind) {
    case 'write':
      return `\u001B[${String(operation.row)};${String(operation.column)}H${operation.text}`;
    case 'clearLine':
      return `\u001B[${String(operation.row)};1H\u001B[2K`;
    case 'moveCursor':
      return `\u001B[${String(operation.row)};${String(operation.column)}H`;
    case 'showCursor':
      return operation.visible ? '\u001B[?25h' : '\u001B[?25l';
  }
}

function rowTextFromCells(frame: Frame, row: number): string {
  const rowCells = frame.cells
    .filter((cell) => cell.row === row && cell.column >= 1 && cell.column <= frame.width)
    .sort(compareCells);
  if (rowCells.length === 0) return '';
  let output = '';
  let nextColumn = 1;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    output += ' '.repeat(cell.column - nextColumn);
    output += cell.text;
    nextColumn = cell.column + measureTextCells(cell.text).cells;
  }
  return output.replace(/\s+$/u, '');
}

function cellMap(frame: Frame): Map<string, FrameCell> {
  return new Map(frame.cells.map((cell) => [`${String(cell.row)}:${String(cell.column)}`, cell]));
}

function trimTrailingEmptyRows(rows: string[]): string[] {
  const next = [...rows];
  while (next.length > 0 && next.at(-1) === '') next.pop();
  return next;
}
