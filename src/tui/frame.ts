import type { AccessibleSnapshot } from '../accessibility/index.ts';
import { serializeRenderSpans } from './ansi.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { TerminalSerializationPolicy } from './serialization-policy.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FocusPath } from './focus.ts';
import type { Rect } from './layout.ts';
import type {
  FrameCellSource,
  RenderSpan,
  TerminalLink,
  TerminalStyle
} from './render-primitives.ts';
import { sameFrameCell, sameFrameCellSource, sameTerminalLink, sameTerminalStyle, span } from './render-primitives.ts';
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
  readonly dirtyRegions?: readonly Rect[];
}

export interface DiffFramesOptions {
  readonly dirtyRegions?: DirtyRegionSet | readonly Rect[];
}

export interface FrameRowDiff {
  readonly row: number;
  readonly operations: readonly RenderOperation[];
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

export type { AnsiStyleState, RenderSerializeOptions } from './ansi.ts';

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
export {
  block,
  blockFromText,
  clipRenderSpans,
  line,
  sameFrameCell,
  sameFrameCellSource,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle,
  span
} from './render-primitives.ts';
export { serializeRenderSpansStateful } from './ansi.ts';

export function renderFramePlain(frame: Frame): string {
  const rows = Array.from({ length: frame.height }, (_value, index) => rowTextFromCells(frame, index + 1));
  return trimTrailingEmptyRows(rows).join('\n');
}

export function renderFrameAnsi(frame: Frame, options: RenderSerializeOptions): string {
  const operations: RenderOperation[] = [...frameWriteOperations(frame)];
  if (frame.cursor !== undefined) operations.push({ kind: 'moveCursor', row: frame.cursor.row, column: frame.cursor.column });
  return renderDiffAnsi({
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: frame.width,
    height: frame.height,
    operations,
    fullRewrite: true
  }, options);
}

export function diffFrames(previous: Frame | undefined, next: Frame, options: DiffFramesOptions = {}): RenderDiff {
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

  const previousCells = indexFrameCells(previous);
  const nextCells = indexFrameCells(next);
  const operations: RenderOperation[] = [];
  const dirtyRegions = dirtyRectsForFrame(next, options.dirtyRegions);

  if (dirtyRegions === undefined) {
    for (let row = 1; row <= next.height; row += 1) {
      operations.push(...diffRow(previousCells, nextCells, next, row, 1, next.width).operations);
    }
  } else {
    for (const [row, ranges] of dirtyColumnRanges(dirtyRegions)) {
      for (const range of ranges) {
        operations.push(...diffRow(previousCells, nextCells, next, row, range.fromColumn, range.toColumn).operations);
      }
    }
  }

  if (next.cursor !== undefined) {
    operations.push({ kind: 'moveCursor', row: next.cursor.row, column: next.cursor.column });
  }

  return {
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: next.width,
    height: next.height,
    operations,
    fullRewrite: false,
    ...(dirtyRegions === undefined ? {} : { dirtyRegions })
  };
}

export function renderDiffAnsi(diff: RenderDiff, options?: RenderSerializeOptions): string {
  const policy = createTerminalSerializationPolicy(options);
  return diff.operations.map((operation) => renderOperation(operation, options, policy)).join('');
}

export function compareCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}

export function renderFrameDebug(frame: Frame): string {
  const policy = createTerminalSerializationPolicy();
  const writes = frame.cells
    .filter((cell) =>
      cell.continuation !== true
      && cell.row >= 1
      && cell.row <= frame.height
      && cell.column >= 1
      && cell.column <= frame.width
    )
    .sort(compareCells)
    .map((cell) => `${policy.cursorMove(cell.row, cell.column)}${serializeRenderSpans([cellToSpan(cell)])}`)
    .join('');
  const cursor = frame.cursor === undefined
    ? ''
    : policy.cursorMove(frame.cursor.row, frame.cursor.column);
  return `${writes}${cursor}`;
}

function renderOperation(
  operation: RenderOperation,
  options: RenderSerializeOptions | undefined,
  policy: TerminalSerializationPolicy
): string {
  switch (operation.kind) {
    case 'write':
      return `${policy.cursorMove(operation.row, operation.column)}${serializeRenderSpans(operation.spans, options)}`;
    case 'clearRect':
      return policy.clearRect(operation.bounds);
    case 'clearLine':
      return policy.clearLine(operation.row, operation.fromColumn);
    case 'moveCursor':
      return policy.cursorMove(operation.row, operation.column);
    case 'showCursor':
      return policy.showCursor(operation.visible);
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

function trimTrailingEmptyRows(rows: string[]): string[] {
  const next = [...rows];
  while (next.length > 0 && next.at(-1) === '') next.pop();
  return next;
}

function frameWriteOperations(frame: Frame): readonly RenderOperation[] {
  return Array.from({ length: frame.height }, (_value, index) => rowWriteOperations(frame, index + 1, 1)).flat();
}

function rowWriteOperations(frame: Frame, row: number, fromColumn: number, toColumn = frame.width): readonly RenderOperation[] {
  const rowCells = frame.cells
    .filter((cell) =>
      cell.continuation !== true
      && cell.row === row
      && cell.column >= fromColumn
      && cell.column <= toColumn
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

function diffRow(
  previousCells: IndexedFrameCells,
  nextCells: IndexedFrameCells,
  next: Frame,
  row: number,
  fromColumn: number,
  toColumn: number
): FrameRowDiff {
  const operations: RenderOperation[] = [];
  let runStart: number | undefined;
  for (let column = fromColumn; column <= toColumn; column += 1) {
    const changed = !sameCell(cellAt(previousCells, row, column), cellAt(nextCells, row, column));
    if (changed && runStart === undefined) runStart = column;
    if ((!changed || column === toColumn) && runStart !== undefined) {
      const runEnd = changed && column === toColumn ? column : column - 1;
      operations.push(...changedRunOperations(previousCells, nextCells, next, row, runStart, runEnd));
      runStart = undefined;
    }
  }
  return { row, operations: Object.freeze(operations) };
}

function dirtyRectsForFrame(frame: Frame, input: DirtyRegionSet | readonly Rect[] | undefined): readonly Rect[] | undefined {
  if (input === undefined) return undefined;
  const rects = isDirtyRegionSet(input) ? input.rects : input;
  return createDirtyRegionSet(rects).intersect({ row: 1, column: 1, width: frame.width, height: frame.height }).rects;
}

function isDirtyRegionSet(input: DirtyRegionSet | readonly Rect[]): input is DirtyRegionSet {
  return !Array.isArray(input);
}

function dirtyColumnRanges(rects: readonly Rect[]): ReadonlyMap<number, readonly { readonly fromColumn: number; readonly toColumn: number }[]> {
  const rows = new Map<number, { readonly fromColumn: number; readonly toColumn: number }[]>();
  for (const rect of rects) {
    const fromColumn = rect.column;
    const toColumn = rect.column + rect.width - 1;
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      rows.set(row, [...(rows.get(row) ?? []), { fromColumn, toColumn }]);
    }
  }
  return new Map([...rows.entries()].map(([row, ranges]) => [row, mergeColumnRanges(ranges)]));
}

function mergeColumnRanges(
  ranges: readonly { readonly fromColumn: number; readonly toColumn: number }[]
): readonly { readonly fromColumn: number; readonly toColumn: number }[] {
  const sorted = [...ranges].toSorted((left, right) => left.fromColumn - right.fromColumn || left.toColumn - right.toColumn);
  const merged: { readonly fromColumn: number; readonly toColumn: number }[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && previous.toColumn + 1 >= range.fromColumn) {
      merged[merged.length - 1] = {
        fromColumn: previous.fromColumn,
        toColumn: Math.max(previous.toColumn, range.toColumn)
      };
      continue;
    }
    merged.push(range);
  }
  return Object.freeze(merged);
}

function changedRunOperations(
  previousCells: IndexedFrameCells,
  nextCells: IndexedFrameCells,
  next: Frame,
  row: number,
  fromColumn: number,
  toColumn: number
): readonly RenderOperation[] {
  const operations: RenderOperation[] = [];
  if (runNeedsClear(previousCells, nextCells, row, fromColumn, toColumn)) {
    operations.push({ kind: 'clearRect', bounds: { row, column: fromColumn, width: toColumn - fromColumn + 1, height: 1 } });
  }
  operations.push(...rowWriteOperations(next, row, fromColumn, toColumn));
  return operations;
}

function runNeedsClear(
  previousCells: IndexedFrameCells,
  nextCells: IndexedFrameCells,
  row: number,
  fromColumn: number,
  toColumn: number
): boolean {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    const previous = cellAt(previousCells, row, column);
    const next = cellAt(nextCells, row, column);
    if (previous !== undefined && next === undefined) return true;
    if (previous === undefined || next === undefined) continue;
    if (previous.width !== next.width) return true;
    if ((previous.continuation === true) !== (next.continuation === true)) return true;
  }
  return false;
}

type IndexedFrameCells = readonly (readonly (FrameCell | undefined)[])[];

function indexFrameCells(frame: Frame): IndexedFrameCells {
  const rows = Array.from({ length: frame.height }, () => Array<FrameCell | undefined>(frame.width));
  for (const cell of frame.cells) {
    if (cell.row < 1 || cell.row > frame.height || cell.column < 1 || cell.column > frame.width) continue;
    const row = rows[cell.row - 1];
    if (row !== undefined) row[cell.column - 1] = cell;
  }
  return rows;
}

function cellAt(cells: IndexedFrameCells, row: number, column: number): FrameCell | undefined {
  return cells[row - 1]?.[column - 1];
}

function pushSpan(spans: RenderSpan[], next: RenderSpan): void {
  const previous = spans.at(-1);
  if (
    previous !== undefined
    && sameTerminalStyle(previous.style, next.style)
    && sameTerminalLink(previous.link, next.link)
    && sameFrameCellSource(previous.source, next.source)
  ) {
    spans[spans.length - 1] = { ...previous, text: `${previous.text}${next.text}` };
    return;
  }
  spans.push(next);
}

function sameCell(left: FrameCell | undefined, right: FrameCell | undefined): boolean {
  return sameFrameCell(left, right);
}

function cellToSpan(cell: FrameCell): RenderSpan {
  return span(cell.text, {
    ...(cell.style === undefined ? {} : { style: cell.style }),
    ...(cell.link === undefined ? {} : { link: cell.link }),
    ...(cell.source === undefined ? {} : { source: cell.source })
  });
}
