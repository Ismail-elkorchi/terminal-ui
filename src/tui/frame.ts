import type { AccessibleSnapshot } from '../accessibility/index.ts';
import { serializeRenderSpans } from './ansi.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { TerminalSerializationPolicy } from './serialization-policy.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { CursorPosition } from './cursor.ts';
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

export type { CursorPosition } from './cursor.ts';

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
  ClipRenderSpansOptions,
  FrameCellSource,
  PadRenderLineOptions,
  RenderAlignment,
  RenderBlock,
  RenderBlockSize,
  RenderClipMode,
  RenderLine,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from './render-primitives.ts';
export type {
  FrameBuffer,
  FrameBufferSnapshot,
  FrameBufferSnapshotMetadata,
  FrameBufferSnapshotOptions,
  FrameRowFingerprint
} from './frame-buffer.ts';
export { createFrameBuffer } from './frame-buffer.ts';
export {
  alignRenderLine,
  block,
  blockFromText,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  line,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  sameFrameCell,
  sameFrameCellSource,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle,
  span,
  wrapRenderSpans
} from './render-primitives.ts';
export {
  frameCellSource,
  frameSourcePart,
  sanitizeFrameCellSource,
  widgetFrameSource
} from './frame-source.ts';
export { serializeRenderSpansStateful } from './ansi.ts';

export function renderFramePlain(frame: Frame): string {
  const cellsByRow = indexRenderableCellsByRow(frame);
  const rows = Array.from({ length: frame.height }, (_value, index) => rowTextFromCells(cellsByRow.get(index + 1) ?? [], frame.width));
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

  const operations: RenderOperation[] = [];
  const dirtyRegions = dirtyRectsForFrame(next, options.dirtyRegions);
  const dirtyRanges = dirtyRegions === undefined ? undefined : dirtyColumnRanges(dirtyRegions);
  const previousCells = indexFrameCells(previous, dirtyRanges);
  const nextCells = indexFrameCells(next, dirtyRanges);
  const nextRows = indexRenderableCellsByRow(next);
  const unchangedRows = unchangedFingerprintRows(previous, next);

  if (dirtyRegions === undefined) {
    for (let row = 1; row <= next.height; row += 1) {
      if (unchangedRows?.has(row) === true) continue;
      operations.push(...diffRow(previousCells, nextCells, nextRows, next.width, row, 1, next.width).operations);
    }
  } else {
    for (const [row, ranges] of dirtyRanges ?? []) {
      if (unchangedRows?.has(row) === true) continue;
      for (const range of ranges) {
        operations.push(...diffRow(previousCells, nextCells, nextRows, next.width, row, range.fromColumn, range.toColumn).operations);
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

function rowTextFromCells(rowCells: readonly FrameCell[], width: number): string {
  if (rowCells.length === 0) return '';
  let output = '';
  let nextColumn = 1;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    if (cell.column > width) break;
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
  const cellsByRow = indexRenderableCellsByRow(frame);
  return Array.from({ length: frame.height }, (_value, index) =>
    rowWriteOperations(cellsByRow.get(index + 1) ?? [], index + 1, frame.width, 1)
  ).flat();
}

function rowWriteOperations(
  rowCells: readonly FrameCell[],
  row: number,
  width: number,
  fromColumn: number,
  toColumn = width
): readonly RenderOperation[] {
  if (rowCells.length === 0) return [];
  const spans: RenderSpan[] = [];
  let nextColumn = fromColumn;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    if (cell.column > toColumn || cell.column > width) break;
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
  nextRows: RowCellIndex,
  nextWidth: number,
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
      operations.push(...changedRunOperations(previousCells, nextCells, nextRows, nextWidth, row, runStart, runEnd));
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

interface ColumnRange {
  readonly fromColumn: number;
  readonly toColumn: number;
}

type DirtyColumnRanges = ReadonlyMap<number, readonly ColumnRange[]>;

function dirtyColumnRanges(rects: readonly Rect[]): DirtyColumnRanges {
  const rows = new Map<number, ColumnRange[]>();
  for (const rect of rects) {
    const fromColumn = rect.column;
    const toColumn = rect.column + rect.width - 1;
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      rows.set(row, [...(rows.get(row) ?? []), { fromColumn, toColumn }]);
    }
  }
  return new Map([...rows.entries()].map(([row, ranges]) => [row, mergeColumnRanges(ranges)]));
}

function mergeColumnRanges(ranges: readonly ColumnRange[]): readonly ColumnRange[] {
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
  nextRows: RowCellIndex,
  nextWidth: number,
  row: number,
  fromColumn: number,
  toColumn: number
): readonly RenderOperation[] {
  const operations: RenderOperation[] = [];
  if (runNeedsClear(previousCells, nextCells, row, fromColumn, toColumn)) {
    operations.push({ kind: 'clearRect', bounds: { row, column: fromColumn, width: toColumn - fromColumn + 1, height: 1 } });
  }
  operations.push(...rowWriteOperations(nextRows.get(row) ?? [], row, nextWidth, fromColumn, toColumn));
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

type IndexedFrameCells = ReadonlyMap<number, ReadonlyMap<number, FrameCell>>;
type RowCellIndex = ReadonlyMap<number, readonly FrameCell[]>;
interface FrameWithSnapshotMetadata extends Frame {
  readonly metadata?: {
    readonly rowFingerprints?: readonly { readonly row: number; readonly fingerprint: string }[];
  };
}

function unchangedFingerprintRows(previous: Frame, next: Frame): ReadonlySet<number> | undefined {
  const previousRows = rowFingerprintMap(previous);
  const nextRows = rowFingerprintMap(next);
  if (previousRows === undefined || nextRows === undefined) return undefined;
  const unchanged = new Set<number>();
  for (const [row, previousFingerprint] of previousRows) {
    if (nextRows.get(row) === previousFingerprint) unchanged.add(row);
  }
  return unchanged;
}

function rowFingerprintMap(frame: Frame): ReadonlyMap<number, string> | undefined {
  const rowFingerprints = (frame as FrameWithSnapshotMetadata).metadata?.rowFingerprints;
  if (rowFingerprints === undefined) return undefined;
  return new Map(rowFingerprints.map((entry) => [entry.row, entry.fingerprint]));
}

function indexRenderableCellsByRow(frame: Frame): RowCellIndex {
  const rows = new Map<number, FrameCell[]>();
  for (const cell of frame.cells) {
    if (
      cell.continuation === true
      || cell.row < 1
      || cell.row > frame.height
      || cell.column < 1
      || cell.column > frame.width
    ) {
      continue;
    }
    const rowCells = rows.get(cell.row);
    if (rowCells === undefined) rows.set(cell.row, [cell]);
    else rowCells.push(cell);
  }
  return new Map([...rows.entries()].map(([row, cells]) => [row, Object.freeze(cells.toSorted(compareCells))]));
}

function indexFrameCells(frame: Frame, dirtyRanges: DirtyColumnRanges | undefined): IndexedFrameCells {
  const rows = new Map<number, Map<number, FrameCell>>();
  for (const cell of frame.cells) {
    if (cell.row < 1 || cell.row > frame.height || cell.column < 1 || cell.column > frame.width) continue;
    if (dirtyRanges !== undefined && !cellOverlapsAnyRange(cell, dirtyRanges.get(cell.row))) continue;
    const rowCells = rows.get(cell.row);
    if (rowCells === undefined) rows.set(cell.row, new Map([[cell.column, cell]]));
    else rowCells.set(cell.column, cell);
  }
  return new Map([...rows.entries()].map(([row, cells]) => [row, new Map(cells)]));
}

function cellAt(cells: IndexedFrameCells, row: number, column: number): FrameCell | undefined {
  return cells.get(row)?.get(column);
}

function cellOverlapsAnyRange(cell: FrameCell, ranges: readonly ColumnRange[] | undefined): boolean {
  if (ranges === undefined) return false;
  const fromColumn = cell.column;
  const toColumn = cell.column + Math.max(1, cell.width) - 1;
  return ranges.some((range) => fromColumn <= range.toColumn && toColumn >= range.fromColumn);
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
