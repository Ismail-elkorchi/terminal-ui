import { measureTextCells, sanitizeTerminalCellText } from '../../text/index.ts';
import { createAccessibleSnapshot } from '../../accessibility/index.ts';
import { DirtyCoverageAccumulator } from './dirty-coverage.ts';
import { frameCellSource } from '../../visual/source.ts';
import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import type { FrameCellSource } from '../../visual/source.ts';
import type { FocusPath } from './focus.ts';
import type { CursorPosition } from '../contracts.ts';
import type { Frame, FrameCell, FrameHitTarget } from '../contracts.ts';
import type { Rect } from '../contracts.ts';
import { normalizeTerminalLink } from '../../visual/render.ts';
import { normalizeTerminalStyle } from '../../visual/terminal-style.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalColor, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import type { RenderTarget } from '../contracts.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { GraphemeSegment } from '../../text/index.ts';
import { defaultTextWidthProfile, defineTextWidthProfile } from '../../text/index.ts';
import { assertFrameDimensions } from './frame-limits.ts';
import { isRasterImage } from '../../graphics/raster-image.ts';
import type { GraphicPlacement, GraphicPlacementInput } from '../../graphics/types.ts';
import {
  registerFrameSnapshotMetadata,
} from './frame-snapshot.ts';
import type {
  FrameRowFingerprint,
  FrameSnapshotRowIndex,
} from './frame-snapshot.ts';

export interface FrameBufferOptions {
  readonly widthProfile?: TextWidthProfile;
}

export interface FrameBufferSnapshotOptions {
  readonly canvasStyle?: TerminalStyle;
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility?: AccessibleSnapshot;
  readonly hitTargets?: readonly FrameHitTarget[];
}

declare const frameBufferSnapshotBrand: unique symbol;

export interface FrameBufferSnapshot extends Frame {
  readonly [frameBufferSnapshotBrand]: true;
}

export interface FrameBuffer extends RenderTarget {
  readonly width: number;
  readonly height: number;

  write(row: number, column: number, spans: readonly RenderSpan[]): void;
  writeLine(row: number, column: number, line: RenderLine): void;
  writeBlock(row: number, column: number, block: RenderBlock): void;
  writeCell(cell: FrameCell): void;
  placeGraphic(placement: GraphicPlacementInput): void;
  readCell(row: number, column: number): FrameCell | undefined;
  occludeGraphics(rect: Rect): void;
  removeGraphic(id: string): void;

  clear(rect?: Rect): void;
  snapshot(options?: FrameBufferSnapshotOptions): FrameBufferSnapshot;
}

export function createFrameBuffer(width: number, height: number, options: FrameBufferOptions = {}): FrameBuffer {
  return new CellFrameBuffer(
    width,
    height,
    defineTextWidthProfile(options.widthProfile ?? defaultTextWidthProfile),
    false
  );
}

export function createCompositingFrameBuffer(
  width: number,
  height: number,
  options: FrameBufferOptions = {}
): FrameBuffer {
  return new CellFrameBuffer(
    width,
    height,
    defineTextWidthProfile(options.widthProfile ?? defaultTextWidthProfile),
    true
  );
}

export function blitFrameCell(buffer: RenderTarget, cell: FrameCell): void {
  if (buffer instanceof CellFrameBuffer) {
    buffer[blitCell](cell);
    return;
  }
  buffer.writeCell(cell);
}

/** Transfers a cell already produced by a framework-owned frame snapshot. */
export function transferFrameCell(buffer: RenderTarget, cell: FrameCell): void {
  if (buffer instanceof CellFrameBuffer) {
    buffer[transferCell](cell);
    return;
  }
  buffer.writeCell(cell);
}

export function transferGraphicPlacement(buffer: RenderTarget, placement: GraphicPlacement): void {
  buffer.placeGraphic(placement);
}

export interface PreparedRenderSpan {
  readonly graphemes: readonly Pick<GraphemeSegment, 'text' | 'cells'>[];
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
}

/** Transfers spans already sanitized, measured, and canonicalized by a scoped renderer boundary. */
export function transferPreparedRenderSpans(
  buffer: RenderTarget,
  row: number,
  column: number,
  spans: readonly PreparedRenderSpan[],
): void {
  if (buffer instanceof CellFrameBuffer) {
    buffer[transferSpans](row, column, spans);
    return;
  }
  buffer.write(row, column, spans.map((current) => ({
    text: current.graphemes.map((grapheme) => grapheme.text).join(''),
    ...(current.style === undefined ? {} : { style: current.style }),
    ...(current.link === undefined ? {} : { link: current.link }),
    ...(current.source === undefined ? {} : { source: current.source }),
  })));
}

/** Applies a full-canvas backdrop without materializing empty terminal cells. */
export function applyImplicitCanvasBackdrop(
  buffer: FrameBuffer,
  bounds: Rect,
  style: TerminalStyle,
): boolean {
  return buffer instanceof CellFrameBuffer && buffer[applyBackdrop](bounds, style);
}

export function mergeableFrameCells(buffer: FrameBuffer): readonly FrameCell[] {
  if (buffer instanceof CellFrameBuffer) return buffer[mergeableCells]();
  return buffer.snapshot().cells.filter(isMergeableFrameCell);
}

const blitCell = Symbol('terminal-ui.blit-frame-cell');
const transferCell = Symbol('terminal-ui.transfer-frame-cell');
const transferSpans = Symbol('terminal-ui.transfer-render-spans');
const applyBackdrop = Symbol('terminal-ui.apply-canvas-backdrop');
const mergeableCells = Symbol('terminal-ui.mergeable-frame-cells');

class CellFrameBuffer implements FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;

  private readonly rows = new Map<number, Map<number, FrameCell>>();
  private readonly graphics = new Map<string, GraphicPlacement>();
  private readonly inheritBackground: boolean;
  private readonly mergeableCellValues = new Set<FrameCell>();
  private readonly writtenCoverage = new DirtyCoverageAccumulator();
  private readonly clearedCoverage = new DirtyCoverageAccumulator();
  private canvasStyleOverride: TerminalStyle | undefined;

  constructor(
    width: number,
    height: number,
    widthProfile: TextWidthProfile,
    inheritBackground: boolean
  ) {
    assertFrameDimensions(width, height);
    this.width = width;
    this.height = height;
    this.widthProfile = widthProfile;
    this.inheritBackground = inheritBackground;
  }

  write(row: number, column: number, spans: readonly RenderSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      const text = sanitizeTerminalCellText(currentSpan.text).text;
      const measured = measureTextCells(text, { widthProfile: this.widthProfile });
      const style = currentSpan.style === undefined
        ? undefined
        : normalizeTerminalStyle(currentSpan.style, 'Frame span style');
      const link = currentSpan.link === undefined ? undefined : normalizeTerminalLink(currentSpan.link);
      const source = currentSpan.source === undefined ? undefined : frameCellSource(currentSpan.source);
      for (const segment of measured.graphemes) {
        if (segment.cells === 0) {
          this.appendCombining(row, nextColumn, segment.text);
          continue;
        }
        if (nextColumn >= 1 && nextColumn + segment.cells - 1 <= this.width) {
          this.writeGrapheme(row, nextColumn, {
            text: segment.text,
            width: segment.cells,
            ...(style === undefined ? {} : { style }),
            ...(link === undefined ? {} : { link }),
            ...(source === undefined ? {} : { source })
          });
        }
        nextColumn += segment.cells;
      }
    }
  }

  writeLine(row: number, column: number, line: RenderLine): void {
    this.write(row, column, line.spans);
  }

  writeBlock(row: number, column: number, block: RenderBlock): void {
    for (let offset = 0; offset < block.lines.length; offset += 1) {
      if (offset >= this.height) return;
      const currentLine = block.lines[offset];
      if (currentLine !== undefined) this.writeLine(row + offset, column, currentLine);
    }
  }

  writeCell(cell: FrameCell): void {
    if (cell.continuation === true) return;
    this.write(cell.row, cell.column, [{
      text: cell.text,
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    }]);
  }

  placeGraphic(input: GraphicPlacementInput): void {
    if (typeof input.id !== 'string' || input.id.length === 0) {
      throw new TypeError('Graphic placement id must be a non-empty string.');
    }
    if (!isRasterImage(input.image)) {
      throw new TypeError('Graphic placement image must be created by rasterImage().');
    }
    const fit = normalizeGraphicFit(input.fit);
    const bounds = normalizeGraphicRect(input.bounds, 'bounds');
    const requestedClip = input.clip === undefined
      ? bounds
      : normalizeGraphicRect(input.clip, 'clip');
    const clip = this.clipRectIntersection(bounds, requestedClip);
    if (clip === undefined) {
      this.graphics.delete(input.id);
      return;
    }
    this.graphics.set(input.id, Object.freeze({
      id: input.id,
      image: input.image,
      bounds: Object.freeze(bounds),
      fit,
      clip: Object.freeze(clip),
    }));
    this.writtenCoverage.add(clip);
  }

  private clipRectIntersection(bounds: Rect, requestedClip: Rect): Rect | undefined {
    const clip = this.clipRect(requestedClip);
    if (clip === undefined) return undefined;
    const row = Math.max(bounds.row, clip.row);
    const column = Math.max(bounds.column, clip.column);
    const bottom = Math.min(bounds.row + bounds.height, clip.row + clip.height);
    const right = Math.min(bounds.column + bounds.width, clip.column + clip.width);
    return bottom <= row || right <= column
      ? undefined
      : { row, column, width: right - column, height: bottom - row };
  }

  readCell(row: number, column: number): FrameCell | undefined {
    return this.cellAt(row, column);
  }

  clear(rect?: Rect): void {
    const clipped = this.clipRect(rect ?? { row: 1, column: 1, width: this.width, height: this.height });
    if (clipped === undefined) return;
    this.clearedCoverage.add(clipped);
    if (clipped.row === 1 && clipped.column === 1 && clipped.width === this.width && clipped.height === this.height) {
      this.rows.clear();
      this.graphics.clear();
      this.mergeableCellValues.clear();
      return;
    }
    this.occludeGraphics(clipped);
    for (const [row, cells] of this.rows) {
      if (row < clipped.row || row >= clipped.row + clipped.height) continue;
      const affected = [...cells.values()].filter((cell) =>
        cell.column < clipped.column + clipped.width
        && cell.column + Math.max(1, cell.width) > clipped.column
      );
      for (const cell of affected) this.clearCellGroup(row, cell.column, 'none');
    }
  }

  occludeGraphics(rect: Rect): void {
    const clipped = this.clipRect(rect);
    if (clipped === undefined) return;
    for (const [id, placement] of [...this.graphics]) {
      if (!rectsOverlap(placement.clip, clipped)) continue;
      this.graphics.delete(id);
      for (const fragment of subtractRect(placement.clip, clipped)) {
        const fragmentId = `${placement.id}#${String(fragment.row)}:${String(fragment.column)}:${String(fragment.width)}:${String(fragment.height)}`;
        this.graphics.set(fragmentId, Object.freeze({
          ...placement,
          id: fragmentId,
          clip: Object.freeze(fragment),
        }));
      }
    }
  }

  removeGraphic(id: string): void {
    this.graphics.delete(id);
  }

  snapshot(options: FrameBufferSnapshotOptions = {}): FrameBufferSnapshot {
    const accessibility = createAccessibleSnapshot(options.accessibility ?? {
      source: 'renderer',
      root: { id: 'frame', role: 'text', label: 'frame' }
    });
    const requestedCanvasStyle = this.canvasStyleOverride === undefined
      ? options.canvasStyle
      : { ...options.canvasStyle, ...this.canvasStyleOverride };
    const canvasStyle = requestedCanvasStyle === undefined
      ? undefined
      : normalizeTerminalStyle(requestedCanvasStyle, 'Frame canvas style');
    const { cells, rowFingerprints, rowIndexes } = this.snapshotCellsAndFingerprints(canvasStyle);
    const cursor = options.cursor === undefined ? undefined : Object.freeze({
      ...options.cursor,
      ...(options.cursor.style === undefined
        ? {}
        : { style: normalizeTerminalStyle(options.cursor.style, 'Frame cursor style') }),
      ...(options.cursor.source === undefined
        ? {}
        : { source: frameCellSource(options.cursor.source) })
    });
    const frame = Object.freeze({
      width: this.width,
      height: this.height,
      widthProfile: this.widthProfile,
      ...(canvasStyle === undefined ? {} : { canvasStyle }),
      cells,
      graphics: Object.freeze([...this.graphics.values()]),
      accessibility,
      ...(options.hitTargets === undefined ? {} : { hitTargets: immutableHitTargets(options.hitTargets) }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(options.focusPath === undefined ? {} : { focusPath: Object.freeze([...options.focusPath]) })
    }) as FrameBufferSnapshot;
    return registerFrameSnapshotMetadata(frame, Object.freeze({
      writtenBounds: this.writtenCoverage.toDirtyRegionSet(),
      clearedBounds: this.clearedCoverage.toDirtyRegionSet(),
      rowFingerprints,
      rowIndexes,
      fingerprint: bufferFingerprint(rowFingerprints)
    }));
  }

  [blitCell](cell: FrameCell): void {
    if (cell.continuation === true || !this.containsCell(cell.row, cell.column)) return;
    if (cell.width < 1 || cell.column + cell.width - 1 > this.width) return;
    const text = sanitizeTerminalCellText(cell.text).text;
    if (text.length === 0) return;
    const measured = measureTextCells(text, { widthProfile: this.widthProfile });
    if (measured.graphemes.length !== 1 || measured.cells !== cell.width) return;
    const style = cell.style === undefined
      ? undefined
      : normalizeTerminalStyle(cell.style, 'Frame cell style');
    const link = cell.link === undefined ? undefined : normalizeTerminalLink(cell.link);
    this.writeGrapheme(cell.row, cell.column, {
      text,
      width: cell.width,
      ...(style === undefined ? {} : { style }),
      ...(link === undefined ? {} : { link }),
      ...(cell.source === undefined ? {} : { source: frameCellSource(cell.source) })
    });
  }

  [transferCell](cell: FrameCell): void {
    if (cell.continuation === true || !this.containsCell(cell.row, cell.column)) return;
    if (cell.width < 1 || cell.column + cell.width - 1 > this.width) return;
    this.writeGrapheme(cell.row, cell.column, {
      text: cell.text,
      width: cell.width,
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    });
  }

  [transferSpans](row: number, column: number, spans: readonly PreparedRenderSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      for (const grapheme of currentSpan.graphemes) {
        if (grapheme.cells === 0) {
          this.appendCombining(row, nextColumn, grapheme.text);
          continue;
        }
        if (nextColumn >= 1 && nextColumn + grapheme.cells - 1 <= this.width) {
          this.writeGrapheme(row, nextColumn, {
            text: grapheme.text,
            width: grapheme.cells,
            ...(currentSpan.style === undefined ? {} : { style: currentSpan.style }),
            ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
            ...(currentSpan.source === undefined ? {} : { source: currentSpan.source }),
          });
        }
        nextColumn += grapheme.cells;
      }
    }
  }

  [applyBackdrop](bounds: Rect, style: TerminalStyle): boolean {
    const clipped = this.clipRect(bounds);
    if (clipped?.row !== 1
      || clipped.column !== 1
      || clipped.width !== this.width
      || clipped.height !== this.height) return false;
    const backdrop = normalizeTerminalStyle(style, 'Frame canvas backdrop style');
    this.canvasStyleOverride = Object.freeze({ ...this.canvasStyleOverride, ...backdrop });
    for (const [row, cells] of this.rows) {
      for (const cell of [...cells.values()]) {
        const unlinked = { ...cell };
        Reflect.deleteProperty(unlinked, 'link');
        this.setCell(row, cell.column, {
          ...unlinked,
          style: Object.freeze({ ...cell.style, ...backdrop }),
        });
      }
    }
    return true;
  }

  [mergeableCells](): readonly FrameCell[] {
    return Object.freeze([...this.mergeableCellValues]
      .toSorted((left, right) => left.row - right.row || left.column - right.column));
  }

  private containsRow(row: number): boolean {
    return Number.isInteger(row) && row >= 1 && row <= this.height;
  }

  private containsCell(row: number, column: number): boolean {
    return this.containsRow(row) && Number.isInteger(column) && column >= 1 && column <= this.width;
  }

  private clipRect(rect: Rect): Rect | undefined {
    const row = Math.max(1, Math.floor(rect.row));
    const column = Math.max(1, Math.floor(rect.column));
    const bottom = Math.min(this.height + 1, Math.floor(rect.row) + Math.max(0, Math.floor(rect.height)));
    const right = Math.min(this.width + 1, Math.floor(rect.column) + Math.max(0, Math.floor(rect.width)));
    const width = Math.max(0, right - column);
    const height = Math.max(0, bottom - row);
    return width === 0 || height === 0 ? undefined : { row, column, width, height };
  }

  private snapshotCellsAndFingerprints(canvasStyle?: TerminalStyle): {
    readonly cells: readonly FrameCell[];
    readonly rowFingerprints: readonly FrameRowFingerprint[];
    readonly rowIndexes: readonly FrameSnapshotRowIndex[];
  } {
    const output: FrameCell[] = [];
    const rowFingerprints: FrameRowFingerprint[] = [];
    const rowIndexes: FrameSnapshotRowIndex[] = [];
    for (let row = 1; row <= this.height; row += 1) {
      let rowHash = fnvOffset;
      const cells = this.rows.get(row);
      const indexedCells = new Map<number, FrameCell>();
      const renderable: FrameCell[] = [];
      for (const storedCell of cells === undefined
        ? []
        : [...cells.values()].toSorted((left, right) => left.column - right.column)) {
        const cell = effectiveCanvasCell(storedCell, canvasStyle);
        output.push(cell);
        indexedCells.set(cell.column, cell);
        if (cell.continuation !== true) renderable.push(cell);
        rowHash = hashFrameCell(rowHash, cell);
      }
      const fingerprint = hashToString(rowHash);
      rowFingerprints.push(Object.freeze({ row, fingerprint }));
      if (indexedCells.size > 0) {
        rowIndexes.push(Object.freeze({
          row,
          cells: indexedCells,
          renderable: Object.freeze(renderable),
          fingerprint
        }));
      }
    }
    return {
      cells: Object.freeze(output),
      rowFingerprints: Object.freeze(rowFingerprints),
      rowIndexes: Object.freeze(rowIndexes)
    };
  }

  private writeGrapheme(
    row: number,
    column: number,
    cell: Omit<FrameCell, 'row' | 'column'>
  ): void {
    this.occludeGraphics({ row, column, width: Math.max(1, cell.width), height: 1 });
    const existingBackground = this.inheritBackground && cell.style?.bg === undefined
      ? this.cellAt(row, column)?.style?.bg
      : undefined;
    for (let offset = 0; offset < cell.width; offset += 1) {
      if (this.cellAt(row, column + offset) !== undefined) {
        this.clearCellGroup(row, column + offset, 'write');
      }
    }
    this.writtenCoverage.addSpan(row, column, Math.max(1, cell.width));
    const style = existingBackground === undefined
      ? cell.style
      : Object.freeze({ ...cell.style, bg: existingBackground });
    const mainCell: FrameCell = {
      row,
      column,
      text: cell.text,
      width: cell.width,
      ...(style === undefined ? {} : { style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    };
    this.setCell(row, column, mainCell);
    for (let offset = 1; offset < cell.width; offset += 1) {
      this.setCell(row, column + offset, {
        row,
        column: column + offset,
        text: '',
        width: 0,
        ...(style === undefined ? {} : { style }),
        ...(cell.link === undefined ? {} : { link: cell.link }),
        ...(cell.source === undefined ? {} : { source: cell.source }),
        continuation: true
      });
    }
  }

  private appendCombining(row: number, nextColumn: number, text: string): void {
    const targetColumn = nextColumn - 1;
    if (!this.containsCell(row, targetColumn)) return;
    const target = this.cellAt(row, targetColumn);
    if (target === undefined || target.continuation === true) return;
    this.markWritten(target.row, target.column, Math.max(1, target.width));
    this.setCell(row, targetColumn, {
      ...target,
      text: `${target.text}${text}`
    });
  }

  private clearCellGroup(row: number, column: number, coverage: 'write' | 'none'): void {
    if (!this.containsCell(row, column)) return;
    const current = this.cellAt(row, column);
    if (current === undefined) return;
    if (current.continuation === true) {
      const leadingCell = this.findWideLeadingCell(row, column);
      if (leadingCell !== undefined) this.deleteCellSpan(leadingCell, coverage);
      else {
        if (coverage === 'write') this.markWritten(row, column, 1);
        this.deleteCell(row, column);
      }
      return;
    }
    this.deleteCellSpan(current, coverage);
  }

  private findWideLeadingCell(row: number, column: number): FrameCell | undefined {
    for (let candidateColumn = column - 1; candidateColumn >= 1; candidateColumn -= 1) {
      const candidate = this.cellAt(row, candidateColumn);
      if (candidate === undefined) continue;
      if (candidate.continuation === true) continue;
      return candidate.column + candidate.width > column ? candidate : undefined;
    }
    return undefined;
  }

  private deleteCellSpan(cell: FrameCell, coverage: 'write' | 'none'): void {
    const width = Math.max(1, cell.width);
    if (coverage === 'write') this.markWritten(cell.row, cell.column, width);
    for (let offset = 0; offset < width; offset += 1) {
      this.deleteCell(cell.row, cell.column + offset);
    }
  }

  private cellAt(row: number, column: number): FrameCell | undefined {
    if (!this.containsCell(row, column)) return undefined;
    return this.rows.get(row)?.get(column);
  }

  private setCell(row: number, column: number, cell: FrameCell): void {
    if (!this.containsCell(row, column)) return;
    const cells = this.rows.get(row) ?? new Map<number, FrameCell>();
    this.rows.set(row, cells);
    const previous = cells.get(column);
    if (previous !== undefined) this.mergeableCellValues.delete(previous);
    const immutable = Object.freeze(cell);
    cells.set(column, immutable);
    if (isMergeableFrameCell(immutable)) this.mergeableCellValues.add(immutable);
  }

  private deleteCell(row: number, column: number): void {
    if (!this.containsCell(row, column)) return;
    const cells = this.rows.get(row);
    const previous = cells?.get(column);
    if (previous === undefined) return;
    cells?.delete(column);
    this.mergeableCellValues.delete(previous);
    if (cells?.size === 0) this.rows.delete(row);
  }

  private markWritten(row: number, column: number, width: number): void {
    if (!this.containsRow(row)) return;
    const start = Math.max(1, column);
    const end = Math.min(this.width + 1, column + width);
    if (end > start) this.writtenCoverage.addSpan(row, start, end - start);
  }
}

function normalizeGraphicRect(value: unknown, field: string): Rect {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Graphic placement ${field} must be a rectangle.`);
  }
  const rect = value as Readonly<Record<string, unknown>>;
  if (![rect['row'], rect['column'], rect['width'], rect['height']].every((part) => typeof part === 'number')) {
    throw new TypeError(`Graphic placement ${field} must contain numeric coordinates and dimensions.`);
  }
  const row = Math.floor(rect['row'] as number);
  const column = Math.floor(rect['column'] as number);
  const width = Math.floor(rect['width'] as number);
  const height = Math.floor(rect['height'] as number);
  if (
    ![row, column, width, height].every(Number.isSafeInteger)
    || width < 1
    || height < 1
    || !Number.isSafeInteger(row + height)
    || !Number.isSafeInteger(column + width)
  ) {
    throw new RangeError(`Graphic placement ${field} must contain safe integer coordinates and positive dimensions.`);
  }
  return { row, column, width, height };
}

function normalizeGraphicFit(value: unknown): GraphicPlacement['fit'] {
  if (value === 'contain' || value === 'cover' || value === 'fill') return value;
  throw new TypeError("Graphic placement fit must be 'contain', 'cover', or 'fill'.");
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.row < right.row + right.height
    && right.row < left.row + left.height
    && left.column < right.column + right.width
    && right.column < left.column + left.width;
}

function subtractRect(source: Rect, occlusion: Rect): readonly Rect[] {
  const row = Math.max(source.row, occlusion.row);
  const column = Math.max(source.column, occlusion.column);
  const bottom = Math.min(source.row + source.height, occlusion.row + occlusion.height);
  const right = Math.min(source.column + source.width, occlusion.column + occlusion.width);
  if (bottom <= row || right <= column) return [source];
  const sourceBottom = source.row + source.height;
  const sourceRight = source.column + source.width;
  return [
    { row: source.row, column: source.column, width: source.width, height: row - source.row },
    { row: bottom, column: source.column, width: source.width, height: sourceBottom - bottom },
    { row, column: source.column, width: column - source.column, height: bottom - row },
    { row, column: right, width: sourceRight - right, height: bottom - row },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

function effectiveCanvasCell(cell: FrameCell, canvasStyle: TerminalStyle | undefined): FrameCell {
  if (canvasStyle === undefined) return cell;
  return Object.freeze({
    ...cell,
    style: normalizeTerminalStyle({ ...canvasStyle, ...cell.style }, 'Frame effective cell style')
  });
}

function immutableHitTargets(hitTargets: readonly FrameHitTarget[]): readonly FrameHitTarget[] {
  return Object.freeze(hitTargets.map((target) => Object.freeze({
    ...target,
    bounds: Object.freeze({ ...target.bounds }),
    ...(target.accepts === undefined ? {} : { accepts: Object.freeze([...target.accepts]) }),
    ...(target.focus === undefined
      ? {}
      : {
          focus: Object.freeze(target.focus.kind === 'preserve'
            ? { kind: 'preserve' as const }
            : { kind: 'focus' as const, path: Object.freeze([...target.focus.path]) })
        })
  })));
}

function isMergeableFrameCell(cell: FrameCell): boolean {
  return cell.continuation !== true
    && cell.width === 1
    && (cell.source?.cellRole === 'border' || cell.source?.cellRole === 'separator');
}

function bufferFingerprint(rows: readonly FrameRowFingerprint[]): string {
  let hash = fnvOffset;
  for (const row of rows) {
    hash = hashNumber(hash, row.row);
    hash = hashText(hash, row.fingerprint);
  }
  return hashToString(hash);
}

const fnvOffset = 0x811c9dc5;
const fnvPrime = 0x01000193;
const hashTagCell = 0x01;
const hashTagStyle = 0x02;
const hashTagStyleNone = 0x03;
const hashTagColorNone = 0x04;
const hashTagColorAnsi = 0x05;
const hashTagColorRgb = 0x06;
const hashTagColorTheme = 0x07;
const hashTagLink = 0x08;
const hashTagLinkNone = 0x09;
const hashTagSource = 0x0a;
const hashTagSourceNone = 0x0b;
const hashTagNumber = 0x0c;
const hashTagNumberNan = 0x0d;
const hashTagBoolean = 0x0e;
const hashTagTextEnd = 0x0f;
const sourceFingerprintCache = new WeakMap<FrameCellSource, number>();
const styleFingerprintCache = new WeakMap<TerminalStyle, number>();
const linkFingerprintCache = new WeakMap<TerminalLink, number>();

function hashFrameCell(hash: number, cell: FrameCell): number {
  let next = hashCodeUnit(hash, hashTagCell);
  next = hashNumber(next, cell.column);
  next = hashText(next, cell.text);
  next = hashNumber(next, cell.width);
  next = hashBoolean(next, cell.continuation === true);
  next = hashTerminalStyle(next, cell.style);
  next = hashTerminalLink(next, cell.link);
  return hashFrameCellSource(next, cell.source);
}

function hashTerminalStyle(hash: number, style: TerminalStyle | undefined): number {
  if (style === undefined) return hashCodeUnit(hash, hashTagStyleNone);
  return hashNumber(hashCodeUnit(hash, hashTagStyle), terminalStyleFingerprint(style));
}

function terminalStyleFingerprint(style: TerminalStyle): number {
  const cached = styleFingerprintCache.get(style);
  if (cached !== undefined) return cached;
  let next = fnvOffset;
  next = hashTerminalColor(next, style.fg);
  next = hashTerminalColor(next, style.bg);
  next = hashBoolean(next, style.bold === true);
  next = hashBoolean(next, style.dim === true);
  next = hashBoolean(next, style.italic === true);
  next = hashBoolean(next, style.underline === true);
  next = hashBoolean(next, style.strikethrough === true);
  next = hashBoolean(next, style.inverse === true);
  next = hashBoolean(next, style.hidden === true);
  styleFingerprintCache.set(style, next);
  return next;
}

function hashTerminalColor(hash: number, color: TerminalColor | undefined): number {
  if (color === undefined) return hashCodeUnit(hash, hashTagColorNone);
  switch (color.kind) {
    case 'ansi':
      return hashNumber(hashCodeUnit(hash, hashTagColorAnsi), color.value);
    case 'rgb': {
      let next = hashCodeUnit(hash, hashTagColorRgb);
      next = hashNumber(next, color.r);
      next = hashNumber(next, color.g);
      return hashNumber(next, color.b);
    }
    case 'theme':
      return hashText(hashCodeUnit(hash, hashTagColorTheme), color.token);
  }
}

function hashTerminalLink(hash: number, link: TerminalLink | undefined): number {
  if (link === undefined) return hashCodeUnit(hash, hashTagLinkNone);
  return hashNumber(hashCodeUnit(hash, hashTagLink), terminalLinkFingerprint(link));
}

function terminalLinkFingerprint(link: TerminalLink): number {
  const cached = linkFingerprintCache.get(link);
  if (cached !== undefined) return cached;
  let next = fnvOffset;
  next = hashText(next, link.href);
  next = hashText(next, link.id ?? '');
  linkFingerprintCache.set(link, next);
  return next;
}

function hashFrameCellSource(hash: number, source: FrameCellSource | undefined): number {
  if (source === undefined) return hashCodeUnit(hash, hashTagSourceNone);
  return hashNumber(hashCodeUnit(hash, hashTagSource), frameCellSourceFingerprint(source));
}

function frameCellSourceFingerprint(source: FrameCellSource): number {
  const cached = sourceFingerprintCache.get(source);
  if (cached !== undefined) return cached;
  let next = fnvOffset;
  next = hashText(next, source.elementId ?? '');
  next = hashText(next, source.elementKind ?? '');
  next = hashText(next, source.rendererFamily ?? '');
  next = hashText(next, source.cellRole ?? '');
  next = hashText(next, source.partName ?? '');
  next = hashText(next, source.partType ?? '');
  next = hashText(next, source.itemId ?? '');
  next = hashNumber(next, source.itemIndex ?? -1);
  next = hashText(next, source.interactionState ?? '');
  next = hashText(next, source.description ?? '');
  sourceFingerprintCache.set(source, next);
  return next;
}

function hashText(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next = hashCodeUnit(next, value.charCodeAt(index));
  }
  return hashCodeUnit(next, hashTagTextEnd);
}

function hashNumber(hash: number, value: number): number {
  let next = hashCodeUnit(hash, hashTagNumber);
  if (!Number.isFinite(value)) return hashCodeUnit(next, hashTagNumberNan);
  if (!Number.isInteger(value)) return hashText(next, String(value));
  const normalized = Math.trunc(value);
  next = hashBoolean(next, normalized < 0);
  const absolute = Math.abs(normalized);
  next = hashCodeUnit(next, absolute & 0xffff);
  return hashCodeUnit(next, (absolute >>> 16) & 0xffff);
}

function hashBoolean(hash: number, value: boolean): number {
  return hashCodeUnit(hashCodeUnit(hash, hashTagBoolean), value ? 1 : 0);
}

function hashCodeUnit(hash: number, value: number): number {
  return Math.imul((hash ^ value) >>> 0, fnvPrime) >>> 0;
}

function hashToString(hash: number): string {
  return hash.toString(16).padStart(8, '0');
}
