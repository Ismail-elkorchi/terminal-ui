import { serializeRenderSpans } from './ansi.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import { planTerminalOutput } from './output-planner.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type {
  Frame,
  FrameCell,
  FrameDescriptor,
  FrameRowDiff,
  RenderDiff,
  RenderOperation,
  RenderWorkInstrumentation
} from '../contracts.ts';
import type { Rect } from '../contracts.ts';
import type {
  RenderSpan,
  TerminalStyle
} from '../../visual/render.ts';
import { sameFrameCellSource, sameTerminalLink, sameTerminalStyle, span } from '../../visual/render.ts';
import type { RenderSerializeOptions } from './ansi.ts';
import { textWidthProfileKey } from '../../text/index.ts';
import { frameIndex } from './frame-index.ts';
import type { FrameIndex } from './frame-index.ts';
import type { GraphicOperation, GraphicPlacement } from '../../graphics/index.ts';
import { sameFrameCell } from './frame-cell-equality.ts';

export type { CursorPosition, Frame, FrameCell, FrameHitTarget } from '../contracts.ts';

export type { FocusPath } from './focus.ts';

export interface DiffFramesOptions {
  readonly dirtyRegions?: DirtyRegionSet | readonly Rect[];
  readonly instrumentation?: RenderWorkInstrumentation;
}

export interface RenderDiffAnsiOptions extends RenderSerializeOptions {
  readonly instrumentation?: RenderWorkInstrumentation;
}

export type { FrameRowDiff, RenderDiff, RenderOperation } from '../contracts.ts';

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
} from '../../visual/render.ts';
export type {
  FrameBuffer,
  FrameBufferOptions,
  FrameBufferSnapshot,
  FrameBufferSnapshotOptions,
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
  sameFrameCellSource,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle,
  span,
  wrapRenderSpans
} from '../../visual/render.ts';
export {
  frameCellSource,
  frameSourcePart,
  renderNodeFrameSource
} from '../../visual/source.ts';
export { serializeRenderSpansStateful } from './ansi.ts';

export function renderFramePlain(frame: FrameDescriptor): string {
  const rowsByIndex = frameIndex(frame).rows;
  const rows = Array.from({ length: frame.height }, (_value, index) =>
    rowTextFromCells(rowsByIndex[index]?.renderable ?? [], frame.width));
  return trimTrailingEmptyRows(rows).join('\n');
}

export function renderFrameAnsi(frame: Frame, options: RenderSerializeOptions): string {
  const operations: RenderOperation[] = [
    ...(frame.canvasStyle === undefined || frame.width === 0 || frame.height === 0
      ? []
      : [canvasClearOperation(frame)]),
    ...frameWriteOperations(frame)
  ];
  return renderDiffAnsi({
    width: frame.width,
    height: frame.height,
    widthProfile: frame.widthProfile,
    operations,
    graphicOperations: frame.graphics.map((placement) => ({ kind: 'place', placement })),
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    fullRewrite: true
  }, options);
}

export function diffFrames(previous: Frame | undefined, next: Frame, options: DiffFramesOptions = {}): RenderDiff {
  if (
    previous?.width !== next.width
    || previous.height !== next.height
    || textWidthProfileKey(previous.widthProfile) !== textWidthProfileKey(next.widthProfile)
    || !sameTerminalStyle(previous.canvasStyle, next.canvasStyle)
  ) {
    const clear = next.width > 0 && next.height > 0
      ? [canvasClearOperation(next)]
      : [];
    const diff: RenderDiff = {
      width: next.width,
      height: next.height,
      widthProfile: next.widthProfile,
      operations: [
        ...clear,
        ...frameWriteOperations(next)
      ],
      graphicOperations: next.graphics.map((placement) => ({ kind: 'place', placement })),
      ...(next.cursor === undefined ? {} : { cursor: next.cursor }),
      fullRewrite: true
    };
    recordDiffWork(options.instrumentation, next.height, next.width * next.height, diff.operations.length);
    return diff;
  }

  const operations: RenderOperation[] = [];
  let comparedRows = 0;
  let comparedCells = 0;
  const dirtyRegions = dirtyRectsForFrame(next, options.dirtyRegions);
  const dirtyRanges = dirtyRegions === undefined ? undefined : dirtyColumnRanges(dirtyRegions);
  const previousCells = frameIndex(previous);
  const nextCells = frameIndex(next);

  if (dirtyRegions === undefined) {
    for (let row = 1; row <= next.height; row += 1) {
      comparedRows += 1;
      if (fingerprintsMatch(previousCells, nextCells, row)) continue;
      comparedCells += next.width;
      operations.push(...diffRow(previousCells, nextCells, next.width, row, 1, next.width).operations);
    }
  } else {
    for (const [row, ranges] of dirtyRanges ?? []) {
      comparedRows += 1;
      if (fingerprintsMatch(previousCells, nextCells, row)) continue;
      for (const range of ranges) {
        comparedCells += range.toColumn - range.fromColumn + 1;
        operations.push(...diffRow(previousCells, nextCells, next.width, row, range.fromColumn, range.toColumn).operations);
      }
    }
  }

  const diff: RenderDiff = {
    width: next.width,
    height: next.height,
    widthProfile: next.widthProfile,
    operations,
    graphicOperations: diffGraphics(previous.graphics, next.graphics),
    ...(next.cursor === undefined ? {} : { cursor: next.cursor }),
    fullRewrite: false,
    ...(dirtyRegions === undefined ? {} : { dirtyRegions })
  };
  recordDiffWork(options.instrumentation, comparedRows, comparedCells, operations.length);
  return diff;
}

function diffGraphics(
  previous: readonly GraphicPlacement[],
  next: readonly GraphicPlacement[],
): readonly GraphicOperation[] {
  const previousById = new Map(previous.map((placement) => [placement.id, placement]));
  const nextById = new Map(next.map((placement) => [placement.id, placement]));
  const operations: GraphicOperation[] = [];
  for (const placement of previous) {
    if (!nextById.has(placement.id)) operations.push({ kind: 'remove', id: placement.id });
  }
  for (const placement of next) {
    const prior = previousById.get(placement.id);
    if (prior === undefined || !sameGraphicPlacement(prior, placement)) {
      operations.push({ kind: 'place', placement });
    }
  }
  return Object.freeze(operations);
}

function sameGraphicPlacement(left: GraphicPlacement, right: GraphicPlacement): boolean {
  return left.image === right.image
    && left.fit === right.fit
    && sameRect(left.bounds, right.bounds)
    && sameRect(left.clip, right.clip);
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}

export function renderDiffAnsi(diff: RenderDiff, options?: RenderDiffAnsiOptions): string {
  const text = planTerminalOutput(diff, options).text;
  options?.instrumentation?.recordWork({ kind: 'encoded_bytes', count: new TextEncoder().encode(text).byteLength });
  return text;
}

function recordDiffWork(
  instrumentation: RenderWorkInstrumentation | undefined,
  rows: number,
  cells: number,
  operations: number
): void {
  instrumentation?.recordWork({ kind: 'diff_rows', count: rows });
  instrumentation?.recordWork({ kind: 'diff_cells', count: cells });
  instrumentation?.recordWork({ kind: 'diff_operations', count: operations });
}

export function compareCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}

export function renderFrameDebug(frame: Frame): string {
  const policy = createTerminalSerializationPolicy();
  const writes = frameIndex(frame).rows
    .flatMap((row) => row?.renderable ?? [])
    .map((cell) => `${policy.cursorMove(cell.row, cell.column)}${serializeRenderSpans([cellToSpan(cell)])}`)
    .join('');
  const cursor = frame.cursor === undefined
    ? ''
    : policy.cursorMove(frame.cursor.row, frame.cursor.column);
  return `${writes}${cursor}`;
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
  const rows = frameIndex(frame).rows;
  return Array.from({ length: frame.height }, (_value, index) =>
    rowWriteOperations(rows[index]?.renderable ?? [], index + 1, frame.width, 1, frame.width, frame.canvasStyle)
  ).flat();
}

function rowWriteOperations(
  rowCells: readonly FrameCell[],
  row: number,
  width: number,
  fromColumn: number,
  toColumn = width,
  canvasStyle?: TerminalStyle
): readonly RenderOperation[] {
  if (rowCells.length === 0) return [];
  const spans: RenderSpan[] = [];
  let nextColumn = fromColumn;
  for (const cell of rowCells) {
    if (cell.column < nextColumn) continue;
    if (cell.column > toColumn || cell.column > width) break;
    if (cell.column > nextColumn) {
      pushSpan(spans, span(' '.repeat(cell.column - nextColumn), styleOptions(canvasStyle)));
    }
    pushSpan(spans, span(cell.text, {
      ...styleOptions(mergeTerminalStyle(canvasStyle, cell.style)),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    }));
    nextColumn = cell.column + cell.width;
  }
  return spans.length === 0 ? [] : [{ kind: 'write', row, column: fromColumn, spans: Object.freeze(spans) }];
}

function diffRow(
  previousCells: FrameIndex,
  nextCells: FrameIndex,
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
      operations.push(...changedRunOperations(previousCells, nextCells, nextWidth, row, runStart, runEnd));
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
  previousCells: FrameIndex,
  nextCells: FrameIndex,
  nextWidth: number,
  row: number,
  fromColumn: number,
  toColumn: number
): readonly RenderOperation[] {
  const operations: RenderOperation[] = [];
  if (runNeedsClear(previousCells, nextCells, row, fromColumn, toColumn)) {
    operations.push({
      kind: 'clearRect',
      bounds: { row, column: fromColumn, width: toColumn - fromColumn + 1, height: 1 },
      ...styleOptions(nextCells.frame.canvasStyle)
    });
  }
  operations.push(...rowWriteOperations(
    nextCells.rows[row - 1]?.renderable ?? [],
    row,
    nextWidth,
    fromColumn,
    toColumn,
    nextCells.frame.canvasStyle
  ));
  return operations;
}

function runNeedsClear(
  previousCells: FrameIndex,
  nextCells: FrameIndex,
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

function fingerprintsMatch(previous: FrameIndex, next: FrameIndex, row: number): boolean {
  const previousFingerprint = previous.rows[row - 1]?.fingerprint;
  if (previousFingerprint === undefined || previousFingerprint !== next.rows[row - 1]?.fingerprint) return false;
  const previousRow = previous.rows[row - 1];
  const nextRow = next.rows[row - 1];
  if (previousRow === undefined || nextRow === undefined) return previousRow === nextRow;
  if (previousRow.cells.size !== nextRow.cells.size) return false;
  for (const [column, cell] of previousRow.cells) {
    if (!sameFrameCell(cell, nextRow.cells.get(column))) return false;
  }
  return true;
}

function cellAt(cells: FrameIndex, row: number, column: number): FrameCell | undefined {
  return cells.rows[row - 1]?.cells.get(column);
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

export { sameFrameCell } from './frame-cell-equality.ts';

function cellToSpan(cell: FrameCell): RenderSpan {
  return span(cell.text, {
    ...(cell.style === undefined ? {} : { style: cell.style }),
    ...(cell.link === undefined ? {} : { link: cell.link }),
    ...(cell.source === undefined ? {} : { source: cell.source })
  });
}

function canvasClearOperation(frame: Frame): Extract<RenderOperation, { readonly kind: 'clearRect' }> {
  return {
    kind: 'clearRect',
    bounds: { row: 1, column: 1, width: frame.width, height: frame.height },
    ...styleOptions(frame.canvasStyle)
  };
}

function mergeTerminalStyle(
  inherited: TerminalStyle | undefined,
  own: TerminalStyle | undefined
): TerminalStyle | undefined {
  if (inherited === undefined) return own;
  if (own === undefined) return inherited;
  return { ...inherited, ...own };
}

function styleOptions(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}
