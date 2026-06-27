import type { AccessibleSnapshot } from '../accessibility/index.ts';
import { serializeRenderSpans } from './ansi.ts';
import type { FocusPath } from './focus.ts';
import type { Rect } from './layout.ts';
import type {
  FrameCellSource,
  RenderSpan,
  TerminalLink,
  TerminalStyle
} from './render-primitives.ts';
import { span } from './render-primitives.ts';
import type { RenderSerializeOptions } from './ansi.ts';

export interface Frame {
  readonly schemaVersion: 'terminal-ui.tui-frame.v1';
  readonly width: number;
  readonly height: number;
  readonly cells: readonly FrameCell[];
  readonly hitTargets?: readonly FrameHitTarget[];
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility: AccessibleSnapshot;
}

export interface FrameCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly width: number;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
  readonly continuation?: boolean;
}

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
}

export interface FrameHitTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
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
  | { readonly kind: 'write'; readonly row: number; readonly column: number; readonly spans: readonly RenderSpan[] }
  | { readonly kind: 'clearRect'; readonly bounds: Rect }
  | { readonly kind: 'clearLine'; readonly row: number; readonly fromColumn?: number }
  | { readonly kind: 'moveCursor'; readonly row: number; readonly column: number }
  | { readonly kind: 'showCursor'; readonly visible: boolean };

export type TerminalEffect =
  | { readonly kind: 'setTitle'; readonly title: string }
  | { readonly kind: 'bell' };

export interface RenderFrameOptions {
  readonly includeControlSequences?: boolean;
  readonly serialize?: RenderSerializeOptions;
}

export type { RenderSerializeOptions } from './ansi.ts';

export type {
  FrameCellSource,
  RenderBlock,
  RenderLine,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from './render-primitives.ts';
export type { FrameBuffer, FrameBufferSnapshotOptions } from './frame-buffer.ts';
export { createFrameBuffer } from './frame-buffer.ts';
export { block, blockFromText, line, span } from './render-primitives.ts';

export function renderFrame(frame: Frame, options: RenderFrameOptions = {}): string {
  if (options.includeControlSequences === true) return renderFrameControlSequences(frame, options);
  const rows = Array.from({ length: frame.height }, (_value, index) => rowTextFromCells(frame, index + 1));
  return trimTrailingEmptyRows(rows).join('\n');
}

export function diffFrames(previous: Frame | undefined, next: Frame): RenderDiff {
  if (previous?.width !== next.width || previous.height !== next.height) {
    return {
      schemaVersion: 'terminal-ui.render-diff.v1',
      width: next.width,
      height: next.height,
      operations: [
        { kind: 'clearRect', bounds: { row: 1, column: 1, width: next.width, height: next.height } },
        ...frameWriteOperations(next)
      ],
      fullRewrite: true
    };
  }

  const operations: RenderOperation[] = [];

  for (let row = 1; row <= next.height; row += 1) {
    const firstChangedColumn = firstChangedColumnInRow(previous, next, row);
    if (firstChangedColumn === undefined) continue;
    operations.push({ kind: 'clearLine', row, fromColumn: firstChangedColumn });
    operations.push(...rowWriteOperations(next, row, firstChangedColumn));
  }

  if (next.cursor !== undefined) {
    operations.push({ kind: 'moveCursor', row: next.cursor.row, column: next.cursor.column });
  }

  return { schemaVersion: 'terminal-ui.render-diff.v1', width: next.width, height: next.height, operations, fullRewrite: false };
}

function firstChangedColumnInRow(previous: Frame, next: Frame, row: number): number | undefined {
  const previousCells = cellMap(previous);
  const nextCells = cellMap(next);
  for (let column = 1; column <= next.width; column += 1) {
    if (!sameCell(previousCells.get(cellKey(row, column)), nextCells.get(cellKey(row, column)))) {
      return column;
    }
  }
  return undefined;
}

export function renderDiff(diff: RenderDiff): string {
  return renderDiffWithOptions(diff);
}

export function renderDiffWithOptions(diff: RenderDiff, options?: RenderSerializeOptions): string {
  return diff.operations.map((operation) => renderOperation(operation, options)).join('');
}

export function compareCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}

function renderFrameControlSequences(frame: Frame, options: RenderFrameOptions): string {
  const writes = frame.cells
    .filter((cell) =>
      cell.continuation !== true
      && cell.row >= 1
      && cell.row <= frame.height
      && cell.column >= 1
      && cell.column <= frame.width
    )
    .sort(compareCells)
    .map((cell) => `\u001B[${String(cell.row)};${String(cell.column)}H${serializeRenderSpans([cellToSpan(cell)], options.serialize)}`)
    .join('');
  const cursor = frame.cursor === undefined
    ? ''
    : `\u001B[${String(frame.cursor.row)};${String(frame.cursor.column)}H`;
  return `${writes}${cursor}`;
}

function renderOperation(operation: RenderOperation, options: RenderSerializeOptions | undefined): string {
  switch (operation.kind) {
    case 'write':
      return `\u001B[${String(operation.row)};${String(operation.column)}H${serializeRenderSpans(operation.spans, options)}`;
    case 'clearRect':
      return clearRectText(operation.bounds);
    case 'clearLine':
      return `\u001B[${String(operation.row)};${String(operation.fromColumn ?? 1)}H\u001B[0K`;
    case 'moveCursor':
      return `\u001B[${String(operation.row)};${String(operation.column)}H`;
    case 'showCursor':
      return operation.visible ? '\u001B[?25h' : '\u001B[?25l';
  }
}

function rowTextFromCells(frame: Frame, row: number): string {
  const rowCells = frame.cells
    .filter((cell) =>
      cell.continuation !== true
      && cell.row === row
      && cell.column >= 1
      && cell.column <= frame.width
    )
    .sort(compareCells);
  if (rowCells.length === 0) return '';
  let output = '';
  let nextColumn = 1;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    output += ' '.repeat(cell.column - nextColumn);
    output += cell.text;
    nextColumn = cell.column + cell.width;
  }
  return output.replace(/\s+$/u, '');
}

function cellMap(frame: Frame): Map<string, FrameCell> {
  return new Map(frame.cells.map((cell) => [cellKey(cell.row, cell.column), cell]));
}

function trimTrailingEmptyRows(rows: string[]): string[] {
  const next = [...rows];
  while (next.length > 0 && next.at(-1) === '') next.pop();
  return next;
}

function frameWriteOperations(frame: Frame): readonly RenderOperation[] {
  return Array.from({ length: frame.height }, (_value, index) => rowWriteOperations(frame, index + 1, 1)).flat();
}

function rowWriteOperations(frame: Frame, row: number, fromColumn: number): readonly RenderOperation[] {
  const rowCells = frame.cells
    .filter((cell) =>
      cell.continuation !== true
      && cell.row === row
      && cell.column >= fromColumn
      && cell.column <= frame.width
    )
    .sort(compareCells);
  if (rowCells.length === 0) return [];
  const spans: RenderSpan[] = [];
  let nextColumn = fromColumn;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    if (cell.column > nextColumn) {
      pushSpan(spans, span(' '.repeat(cell.column - nextColumn)));
    }
    pushSpan(spans, span(cell.text, {
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    }));
    nextColumn = cell.column + cell.width;
  }
  return spans.length === 0 ? [] : [{ kind: 'write', row, column: fromColumn, spans: Object.freeze(spans) }];
}

function pushSpan(spans: RenderSpan[], next: RenderSpan): void {
  const previous = spans.at(-1);
  if (
    previous !== undefined
    && sameJson(previous.style, next.style)
    && sameJson(previous.link, next.link)
    && sameJson(previous.source, next.source)
  ) {
    spans[spans.length - 1] = { ...previous, text: `${previous.text}${next.text}` };
    return;
  }
  spans.push(next);
}

function sameCell(left: FrameCell | undefined, right: FrameCell | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.text === right.text
    && left.width === right.width
    && left.continuation === right.continuation
    && sameJson(left.style, right.style)
    && sameJson(left.link, right.link);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clearRectText(bounds: Rect): string {
  const parts: string[] = [];
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    parts.push(`\u001B[${String(row)};${String(bounds.column)}H${' '.repeat(Math.max(0, bounds.width))}`);
  }
  return parts.join('');
}

function cellKey(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

function cellToSpan(cell: FrameCell): RenderSpan {
  return span(cell.text, {
    ...(cell.style === undefined ? {} : { style: cell.style }),
    ...(cell.link === undefined ? {} : { link: cell.link }),
    ...(cell.source === undefined ? {} : { source: cell.source })
  });
}
