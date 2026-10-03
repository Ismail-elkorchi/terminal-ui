import { createAccessibleSnapshot } from '../accessibility/snapshot.ts';
import type { AccessibleSnapshot } from '../accessibility/types.ts';
import { intersectRects, sameRect } from '../geometry/rect.ts';
import type { Rect } from '../geometry/types.ts';
import { isRasterImage } from '../graphics/raster-image.ts';
import type { GraphicPlacement, GraphicPlacementInput } from '../graphics/types.ts';
import type { FocusPath } from '../interaction/focus.ts';
import { measureTextCells, terminalCellGraphemes } from '../text/measure.ts';
import { sanitizeTerminalCellText } from '../text/sanitize.ts';
import type { GraphemeSegment, TextWidthProfile } from '../text/types.ts';
import { defaultTextWidthProfile, defineTextWidthProfile } from '../text/width-profile.ts';
import type { FrameCellSource } from '../visual/frame-source.ts';
import { frameCellSource, sameFrameCellSource } from '../visual/frame-source.ts';
import type {
  RenderBlock,
  RenderLine,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle,
} from '../visual/render-content.ts';
import {
  decodeTerminalLink,
  sameTerminalLink,
  sameTerminalStyle,
} from '../visual/render-content.ts';
import { decodeTerminalStyle } from '../visual/terminal-style.ts';
import type {
  CursorPosition,
  Frame,
  FrameCell,
  FrameHitTarget,
  FrameRenderTarget,
  RenderInstrumentation,
  RenderTarget,
} from './contracts.ts';
import type { DirtyRegionSet } from './internal/damage-contracts.ts';
import { DirtyCoverageAccumulator } from './internal/dirty-coverage.ts';
import { sameFrameCell } from './internal/frame-cell-equality.ts';
import { assertFrameDimensions } from './internal/frame-limits.ts';
import type { FrameRowFingerprint, FrameSnapshotRowIndex } from './internal/frame-snapshot.ts';
import { registerFrameSnapshotMetadata } from './internal/frame-snapshot.ts';

const snapshotWork = new WeakMap<Frame, { readonly rows: number; readonly cells: number }>();
export function frameSnapshotWork(frame: Frame): { readonly rows: number; readonly cells: number } {
  return snapshotWork.get(frame) ?? { rows: 0, cells: 0 };
}

export interface FrameBufferOptions {
  readonly widthProfile?: TextWidthProfile;
  readonly instrumentation?: Pick<RenderInstrumentation, 'recordWork'>;
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

export interface FrameBuffer extends FrameRenderTarget {
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
    false,
    options.instrumentation,
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
    true,
    options.instrumentation,
  );
}

/** Region storage stays in terminal coordinates; no translated snapshot or cell graph. */
export function createRegionFrameBuffer(
  width: number, height: number, bounds: Rect, options: FrameBufferOptions = {},
): FrameBuffer {
  return new CellFrameBuffer(width, height,
    defineTextWidthProfile(options.widthProfile ?? defaultTextWidthProfile), true,
    options.instrumentation, bounds);
}

type StoredRow = ReadonlyMap<number, FrameCell>;
const snapshotsByRow = new WeakMap<StoredRow, Map<TerminalStyle | undefined, FrameSnapshotRowIndex>>();
const mergeableByRow = new WeakMap<StoredRow, readonly FrameCell[]>();
interface FrameStorage {
  readonly rows: ReadonlyMap<number, StoredRow>;
  readonly graphics: ReadonlyMap<string, GraphicPlacement>;
  readonly canvasStyleOverride: TerminalStyle | undefined;
}
interface PaintRowPatch {
  readonly row: number;
  readonly before: StoredRow | undefined;
  readonly after: StoredRow | undefined;
  readonly intervals: readonly Rect[];
}
/** Private admitted drawing state, published only after a complete successful paint. */
export interface RetainedFramePaint {
  readonly context: {
    readonly width: number;
    readonly height: number;
    readonly widthProfile: TextWidthProfile;
    readonly bounds: Rect | undefined;
    readonly inheritBackground: boolean;
  };
  readonly rows: readonly PaintRowPatch[];
  readonly graphicsBefore: ReadonlyMap<string, GraphicPlacement>;
  readonly graphicsAfter: ReadonlyMap<string, GraphicPlacement>;
  readonly written: DirtyRegionSet;
  readonly cleared: DirtyRegionSet;
}
interface PaintCapture {
  readonly before: Map<number, StoredRow | undefined>;
  readonly written: DirtyCoverageAccumulator;
  readonly cleared: DirtyCoverageAccumulator;
  readonly read: DirtyCoverageAccumulator;
}
export interface FrameBufferCheckpoint {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
}
const storageByFrame = new WeakMap<Frame | FrameBufferCheckpoint, FrameStorage>();
const storageOwners = new WeakMap<RenderTarget, CellFrameBuffer>();

/** Bounded aliases share the existing region owner, never another renderer. */
export function registerFrameBufferAlias<T extends RenderTarget>(target: T, owner: RenderTarget): T {
  const storage = storageOwners.get(owner);
  if (storage !== undefined) storageOwners.set(target, storage);
  return target;
}
export function captureFramePaint(target: RenderTarget, paint: () => void): RetainedFramePaint | undefined {
  const owner = storageOwners.get(target);
  if (owner === undefined) { paint(); return undefined; }
  return owner[capturePaint](paint);
}
export function restoreFramePaint(target: RenderTarget, patch: RetainedFramePaint): boolean {
  return storageOwners.get(target)?.[restorePaint](patch) ?? false;
}
/** Forks immutable committed storage. The first write copies only its touched row. */
export function checkpointFrameBuffer(buffer: FrameBuffer): FrameBufferCheckpoint {
  if (!(buffer instanceof CellFrameBuffer)) throw new TypeError('Only framework-owned frame storage can be retained.');
  return buffer[checkpointStorage]();
}
export function restoreFrameBufferStorage(buffer: FrameBuffer, previous: Frame | FrameBufferCheckpoint): boolean {
  const storage = storageByFrame.get(previous);
  if (!(buffer instanceof CellFrameBuffer) || storage === undefined
    || buffer.width !== previous.width || buffer.height !== previous.height
    || buffer.widthProfile.emoji !== previous.widthProfile.emoji
    || buffer.widthProfile.ambiguous !== previous.widthProfile.ambiguous) return false;
  buffer[restoreStorage](storage);
  return true;
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
  const admitted = admittedSpanTargets.get(buffer);
  if (admitted !== undefined) {
    admitted.cell(cell);
    return;
  }
  buffer.writeCell(cell);
}

export interface FrameBufferSpan {
  readonly graphemes: readonly Pick<GraphemeSegment, 'text' | 'cells'>[];
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
}

interface AdmittedSpanTarget {
  readonly cell: (cell: FrameCell) => void;
  readonly transfer: (row: number, column: number, spans: readonly FrameBufferSpan[]) => void;
  readonly segmented: (codeUnits: number) => void;
}
const admittedSpanTargets = new WeakMap<RenderTarget, AdmittedSpanTarget>();

/** Framework-only registration; component-facing targets never expose this capability. */
export function registerSpanTarget<T extends RenderTarget>(target: T, admission: AdmittedSpanTarget): T {
  admittedSpanTargets.set(target, admission);
  return target;
}

export function recordTargetSegmentation(target: RenderTarget, codeUnits: number): void {
  admittedSpanTargets.get(target)?.segmented(codeUnits);
}

/** Transfers spans already sanitized, measured, and canonicalized by a scoped renderer boundary. */
export function transferFrameBufferSpans(
  buffer: RenderTarget,
  row: number,
  column: number,
  spans: readonly FrameBufferSpan[],
): void {
  const admitted = admittedSpanTargets.get(buffer);
  if (admitted !== undefined) {
    admitted.transfer(row, column, spans);
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

/** Reapplies an unchanged implicit canvas backdrop only within recomposed damage. */
export function applyRetainedCanvasBackdrop(buffer: FrameBuffer, bounds: Rect, style: TerminalStyle): void {
  if (buffer instanceof CellFrameBuffer) buffer[applyBackdrop](bounds, style, true);
}

export function mergeableFrameCells(buffer: FrameBuffer): readonly FrameCell[] {
  if (buffer instanceof CellFrameBuffer) return buffer[mergeableCells]();
  return buffer.snapshot().cells.filter(isMergeableFrameCell);
}

export function captureFrameBufferDamage(buffer: FrameBuffer, operation: () => void): DirtyRegionSet {
  if (!(buffer instanceof CellFrameBuffer)) {
    throw new TypeError('Frame-buffer damage can only be captured for a framework-owned buffer.');
  }
  return buffer[captureDamage](operation);
}

export function seedFrameBufferRows(buffer: FrameBuffer, rows: readonly FrameSnapshotRowIndex[]): void {
  if (buffer instanceof CellFrameBuffer) buffer[retainRows](rows);
}
const retainRows = Symbol('terminal-ui.retain-frame-rows');
const capturePaint = Symbol('terminal-ui.capture-frame-paint');
const restorePaint = Symbol('terminal-ui.restore-frame-paint');
const restoreStorage = Symbol('terminal-ui.restore-frame-storage');
const checkpointStorage = Symbol('terminal-ui.checkpoint-frame-storage');

const blitCell = Symbol('terminal-ui.blit-frame-cell');
const transferCell = Symbol('terminal-ui.transfer-frame-cell');
const transferSpans = Symbol('terminal-ui.transfer-render-spans');
const applyBackdrop = Symbol('terminal-ui.apply-canvas-backdrop');
const mergeableCells = Symbol('terminal-ui.mergeable-frame-cells');
const captureDamage = Symbol('terminal-ui.capture-frame-buffer-damage');

class CellFrameBuffer implements FrameBuffer {
  readonly coordinateSpace = 'frame' as const;
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;

  private readonly rows = new Map<number, StoredRow>();
  private readonly mutableRows = new Set<number>();
  private readonly paintScopes: PaintCapture[] = [];
  private readonly storageBounds: Rect | undefined;
  private graphics: ReadonlyMap<string, GraphicPlacement> = new Map();
  private readonly inheritBackground: boolean;

  private readonly writtenCoverage = new DirtyCoverageAccumulator();
  private readonly clearedCoverage = new DirtyCoverageAccumulator();
  private readonly damageScopes: DirtyCoverageAccumulator[] = [];
  private previousRows = new Map<number, FrameSnapshotRowIndex>();
  private canvasStyleOverride: TerminalStyle | undefined;
  private readonly onSegmentation?: (codeUnits: number) => void;
  private readonly instrumentation: Pick<RenderInstrumentation, 'recordWork'> | undefined;

  constructor(
    width: number,
    height: number,
    widthProfile: TextWidthProfile,
    inheritBackground: boolean,
    instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
    storageBounds?: Rect,
  ) {
    assertFrameDimensions(width, height);
    this.width = width;
    this.height = height;
    this.widthProfile = widthProfile;
    this.instrumentation = instrumentation;
    this.inheritBackground = inheritBackground;
    this.storageBounds = storageBounds === undefined ? undefined : Object.freeze({ ...storageBounds });
    storageOwners.set(this, this);
    registerSpanTarget(this, {
      cell: cell => { this[transferCell](cell); },
      transfer: (row, column, spans) => { this[transferSpans](row, column, spans); },
      segmented: codeUnits => this.onSegmentation?.(codeUnits),
    });
    if (instrumentation?.recordWork !== undefined) {
      this.onSegmentation = (codeUnits) => {
        instrumentation.recordWork?.({ kind: 'buffer_segmentations', count: 1 });
        instrumentation.recordWork?.({ kind: 'buffer_segmented_code_units', count: codeUnits });
      };
    }
  }

  write(row: number, column: number, spans: readonly RenderSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      if (nextColumn > this.width + 1) break;
      const graphemes = terminalCellGraphemes(currentSpan.text, { widthProfile: this.widthProfile }, this.onSegmentation);
      const style = currentSpan.style === undefined
        ? undefined
        : decodeTerminalStyle(currentSpan.style, 'Frame span style');
      const link = currentSpan.link === undefined ? undefined : decodeTerminalLink(currentSpan.link);
      const source = currentSpan.source === undefined ? undefined : frameCellSource(currentSpan.source);
      for (const segment of graphemes) {
        if (nextColumn > this.width || nextColumn + segment.cells > this.width + 1) {
          if (segment.cells > 0) { nextColumn += segment.cells; break; }
        }
        if (segment.cells === 0) {
          this.appendCombining(row, nextColumn, segment.text);
          continue;
        }
        if (this.containsCell(row, nextColumn) && this.containsCell(row, nextColumn + segment.cells - 1)) {
          this.writeGrapheme(row, nextColumn, segment.text, segment.cells, style, link, source);
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
    const fit = decodeGraphicFit(input.fit);
    const bounds = decodeGraphicRect(input.bounds, 'bounds');
    const requestedClip = input.clip === undefined
      ? bounds
      : decodeGraphicRect(input.clip, 'clip');
    const clip = this.clipRectIntersection(bounds, requestedClip);
    if (clip === undefined) {
      this.removeGraphic(input.id);
      return;
    }
    const graphics = new Map(this.graphics);
    graphics.set(input.id, Object.freeze({
      id: input.id,
      image: input.image,
      bounds: Object.freeze(bounds),
      fit,
      clip: Object.freeze(clip),
    }));
    this.graphics = graphics;
    this.recordWrite(clip);
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
    this.recordClear(clipped);
    if (clipped.row === 1 && clipped.column === 1 && clipped.width === this.width && clipped.height === this.height) {
      this.rows.clear();
      this.graphics = new Map();
      this.mutableRows.clear();
      return;
    }
    this.occludeGraphics(clipped);
    for (const [row, cells] of this.rows) {
      if (row < clipped.row || row >= clipped.row + clipped.height) continue;
      // Clearing only removes entries; an iterator is safe for both an owned row
      // and a sealed row that is copied on its first deletion.
      for (const cell of cells.values()) {
        if (cell.column < clipped.column + clipped.width
          && cell.column + Math.max(1, cell.width) > clipped.column) {
          this.clearCellGroup(row, cell.column, 'none');
        }
      }
    }
  }

  occludeGraphics(rect: Rect): void {
    if (this.graphics.size === 0) return;
    const clipped = this.clipRect(rect);
    if (clipped === undefined) return;
    const graphics = new Map(this.graphics);
    for (const [id, placement] of this.graphics) {
      if (!rectsOverlap(placement.clip, clipped)) continue;
      graphics.delete(id);
      for (const fragment of subtractRect(placement.clip, clipped)) {
        const fragmentId = `${placement.id}#${String(fragment.row)}:${String(fragment.column)}:${String(fragment.width)}:${String(fragment.height)}`;
        graphics.set(fragmentId, Object.freeze({
          ...placement,
          id: fragmentId,
          clip: Object.freeze(fragment),
        }));
      }
    }
    this.graphics = graphics;
  }

  removeGraphic(id: string): void {
    const previous = this.graphics.get(id);
    if (previous === undefined) return;
    this.recordClear(previous.clip);
    const graphics = new Map(this.graphics);
    graphics.delete(id);
    this.graphics = graphics;
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
      : decodeTerminalStyle(requestedCanvasStyle, 'Frame canvas style');
    const { cells, rowFingerprints, rowIndexes, work } = this.snapshotCellsAndFingerprints(canvasStyle);
    const cursor = options.cursor === undefined ? undefined : Object.freeze({
      ...options.cursor,
      ...(options.cursor.style === undefined
        ? {}
        : { style: decodeTerminalStyle(options.cursor.style, 'Frame cursor style') }),
      ...(options.cursor.source === undefined
        ? {}
        : { source: frameCellSource(options.cursor.source) })
    });
    const frame = Object.freeze({
      width: this.width,
      height: this.height,
      widthProfile: this.widthProfile,
      ...(canvasStyle === undefined ? {} : { canvasStyle }),
      get cells() { return cells(); },
      graphics: Object.freeze([...this.graphics.values()]),
      accessibility,
      ...(options.hitTargets === undefined ? {} : { hitTargets: immutableHitTargets(options.hitTargets) }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(options.focusPath === undefined ? {} : { focusPath: Object.freeze([...options.focusPath]) })
    }) as FrameBufferSnapshot;
    this.mutableRows.clear();
    storageByFrame.set(frame, { rows: new Map(this.rows), graphics: this.graphics, canvasStyleOverride: this.canvasStyleOverride });
    snapshotWork.set(frame, work);
    return registerFrameSnapshotMetadata(frame, Object.freeze({
      writtenBounds: this.writtenCoverage.toDirtyRegionSet(),
      clearedBounds: this.clearedCoverage.toDirtyRegionSet(),
      rowFingerprints,
      rowIndexes,
      fingerprint: bufferFingerprint(rowFingerprints, 'semantic'),
      terminalFingerprint: bufferFingerprint(rowFingerprints, 'terminal'),
    }));
  }

  [blitCell](cell: FrameCell): void {
    if (cell.continuation === true || !this.containsCell(cell.row, cell.column)) return;
    if (cell.width < 1 || !this.containsCell(cell.row, cell.column + cell.width - 1)) return;
    const text = sanitizeTerminalCellText(cell.text, { widthProfile: this.widthProfile }).text;
    if (text.length === 0) return;
    const measured = measureTextCells(text, { widthProfile: this.widthProfile }, this.onSegmentation);
    if (measured.graphemes.length !== 1 || measured.cells !== cell.width) return;
    const style = cell.style === undefined
      ? undefined
      : decodeTerminalStyle(cell.style, 'Frame cell style');
    const link = cell.link === undefined ? undefined : decodeTerminalLink(cell.link);
    this.writeGrapheme(cell.row, cell.column, text, cell.width, style, link,
      cell.source === undefined ? undefined : frameCellSource(cell.source));
  }

  [transferCell](cell: FrameCell): void {
    if (cell.continuation === true || !this.containsCell(cell.row, cell.column)) return;
    if (cell.width < 1 || !this.containsCell(cell.row, cell.column + cell.width - 1)) return;
    if (cell.width === 1 && this.cellAt(cell.row, cell.column) === undefined) {
      if (this.graphics.size > 0) this.occludeGraphics({ row: cell.row, column: cell.column, width: 1, height: 1 });
      this.recordWriteSpan(cell.row, cell.column, 1);
      this.setCell(cell.row, cell.column, cell);
      return;
    }
    this.writeGrapheme(cell.row, cell.column, cell.text, cell.width, cell.style, cell.link, cell.source);
  }

  [transferSpans](row: number, column: number, spans: readonly FrameBufferSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      if (this.writeSimpleSpan(row, nextColumn, currentSpan)) {
        nextColumn += currentSpan.graphemes.length;
        continue;
      }
      for (const grapheme of currentSpan.graphemes) {
        if (grapheme.cells === 0) {
          this.appendCombining(row, nextColumn, grapheme.text);
          continue;
        }
        if (this.containsCell(row, nextColumn) && this.containsCell(row, nextColumn + grapheme.cells - 1)) {
          this.writeGrapheme(row, nextColumn, grapheme.text, grapheme.cells,
            currentSpan.style, currentSpan.link, currentSpan.source);
        }
        nextColumn += grapheme.cells;
      }
    }
  }

  /** Admit a width-one run once; wide occupants keep their overlap/clear path. */
  private writeSimpleSpan(row: number, column: number, span: FrameBufferSpan): boolean {
    const width = span.graphemes.length;
    if (width === 0 || !this.containsCell(row, column) || !this.containsCell(row, column + width - 1)) return false;
    const stored = this.rows.get(row);
    for (let offset = 0; offset < width; offset += 1) {
      const current = stored?.get(column + offset);
      if (span.graphemes[offset]?.cells !== 1 || current !== undefined && current.width !== 1) return false;
      // Preserve the established per-cell graphic fragmentation when replacing
      // occupants; the existing empty-run path can still occlude as one span.
      if (current !== undefined && this.graphics.size > 0) return false;
    }
    if (this.graphics.size > 0) this.occludeGraphics({ row, column, width, height: 1 });
    this.recordWriteSpan(row, column, width);
    const cells = this.mutableRow(row);
    const previous = this.previousRows.get(row)?.cells;
    for (let offset = 0; offset < width; offset += 1) {
      const grapheme = span.graphemes[offset];
      if (grapheme === undefined) continue;
      const position = column + offset;
      const current = cells.get(position);
      const style = inheritedCellStyle(this.inheritBackground, current, span.style);
      const old = current ?? previous?.get(position);
      const cell = old?.width === 1 && old.text === grapheme.text
        && sameTerminalStyle(old.style, style) && sameTerminalLink(old.link, span.link)
        && sameFrameCellSource(old.source, span.source)
        ? old
        : admittedFrameCell(row, position, grapheme.text, 1, style, span.link, span.source);
      cells.set(position, cell);
    }
    return true;
  }

  [applyBackdrop](bounds: Rect, style: TerminalStyle, retained = false): boolean {
    const clipped = this.clipRect(bounds);
    if (clipped === undefined || !retained && (clipped.row !== 1
      || clipped.column !== 1
      || clipped.width !== this.width
      || clipped.height !== this.height)) return false;
    const backdrop = decodeTerminalStyle(style, 'Frame canvas backdrop style');
    if (!retained) this.canvasStyleOverride = this.canvasStyleOverride === undefined
      ? backdrop
      : effectiveCellStyle(this.canvasStyleOverride, backdrop);
    for (const [row, cells] of this.rows) {
      if (row < clipped.row || row >= clipped.row + clipped.height) continue;
      for (const cell of cells.values()) {
        if (cell.column < clipped.column || cell.column >= clipped.column + clipped.width) continue;
        const style = cell.style === undefined ? backdrop : effectiveCellStyle(cell.style, backdrop);
        if (style === cell.style && cell.link === undefined) continue;
        const unlinked = { ...cell };
        Reflect.deleteProperty(unlinked, 'link');
        this.setCell(row, cell.column, {
          ...unlinked,
          style,
        });
      }
    }
    return true;
  }

  [mergeableCells](): readonly FrameCell[] {
    this.mutableRows.clear();
    const output: FrameCell[] = [];
    for (const row of this.rows.values()) {
      let cells = mergeableByRow.get(row);
      if (cells === undefined) {
        const selected: FrameCell[] = [];
        for (const cell of row.values()) if (isMergeableFrameCell(cell)) selected.push(cell);
        cells = Object.freeze(selected);
        mergeableByRow.set(row, cells);
      }
      for (const cell of cells) output.push(cell);
    }
    return Object.freeze(output.sort((left, right) => left.row - right.row || left.column - right.column));
  }

  [captureDamage](operation: () => void): DirtyRegionSet {
    const damage = new DirtyCoverageAccumulator();
    this.damageScopes.push(damage);
    try {
      operation();
      return damage.toDirtyRegionSet();
    } finally {
      this.damageScopes.pop();
    }
  }

  [retainRows](rows: readonly FrameSnapshotRowIndex[]): void {
    this.previousRows = new Map();
    for (const row of rows) this.previousRows.set(row.row, row);
  }

  [checkpointStorage](): FrameBufferCheckpoint {
    this.mutableRows.clear();
    const checkpoint = Object.freeze({ width: this.width, height: this.height, widthProfile: this.widthProfile });
    storageByFrame.set(checkpoint, { rows: new Map(this.rows), graphics: this.graphics, canvasStyleOverride: this.canvasStyleOverride });
    return checkpoint;
  }

  [restoreStorage](storage: FrameStorage): void {
    this.rows.clear();
    for (const [row, cells] of storage.rows) this.rows.set(row, cells);
    this.mutableRows.clear();
    this.graphics = storage.graphics;
    this.canvasStyleOverride = storage.canvasStyleOverride;
  }

  [capturePaint](paint: () => void): RetainedFramePaint {
    this.mutableRows.clear();
    const graphicsBefore = this.graphics;
    const scope: PaintCapture = { before: new Map(), written: new DirtyCoverageAccumulator(), cleared: new DirtyCoverageAccumulator(), read: new DirtyCoverageAccumulator() };
    this.paintScopes.push(scope);
    try {
      paint();
      this.mutableRows.clear();
      const written = scope.written.toDirtyRegionSet();
      const cleared = scope.cleared.toDirtyRegionSet();
      const coverage = written.union(cleared).union(scope.read.toDirtyRegionSet());
      return Object.freeze({
        context: Object.freeze({ width: this.width, height: this.height, widthProfile: this.widthProfile, bounds: this.storageBounds, inheritBackground: this.inheritBackground }),
        rows: Object.freeze([...scope.before].map(([row, before]) => Object.freeze({
          row, before, after: this.rows.get(row),
          intervals: coverage.rects.filter(rect => row >= rect.row && row < rect.row + rect.height),
        }))),
        graphicsBefore, graphicsAfter: this.graphics, written, cleared,
      });
    } finally {
      this.paintScopes.pop();
    }
  }

  [restorePaint](patch: RetainedFramePaint): boolean {
    if (!this.samePaintContext(patch.context) || !sameGraphics(this.graphics, patch.graphicsBefore)) return false;
    // An earlier overlapping paint may change inherited backgrounds or wide-cell occupancy.
    // Validate every input witness before adopting anything, so a miss is atomic.
    for (const entry of patch.rows) {
      const current = this.rows.get(entry.row);
      if (current === entry.before) continue;
      for (const rect of entry.intervals) {
        for (let column = rect.column; column < rect.column + rect.width; column += 1) {
          if (!sameFrameCell(current?.get(column), entry.before?.get(column))) return false;
        }
      }
    }
    for (const entry of patch.rows) {
      this.captureRow(entry.row);
      for (const scope of this.paintScopes) for (const rect of entry.intervals) {
        scope.read.addSpan(entry.row, rect.column, rect.width);
      }
    }
    for (const rect of patch.written.rects) this.recordWrite(rect);
    for (const rect of patch.cleared.rects) this.recordClear(rect);
    for (const entry of patch.rows) {
      const current = this.rows.get(entry.row);
      if (current === entry.before || sameStoredRow(current, entry.before)) {
        if (entry.after === undefined) this.rows.delete(entry.row);
        else this.rows.set(entry.row, entry.after);
        this.mutableRows.delete(entry.row);
      } else {
        const cells = this.mutableRow(entry.row);
        for (const rect of entry.intervals) {
          for (let column = rect.column; column < rect.column + rect.width; column += 1) {
            const cell = entry.after?.get(column);
            if (cell === undefined) cells.delete(column);
            else cells.set(column, cell);
          }
        }
        if (cells.size === 0) this.rows.delete(entry.row);
      }
    }
    this.graphics = patch.graphicsAfter;
    return true;
  }

  private samePaintContext(context: RetainedFramePaint['context']): boolean {
    return context.width === this.width && context.height === this.height
      && context.widthProfile.emoji === this.widthProfile.emoji && context.widthProfile.ambiguous === this.widthProfile.ambiguous
      && context.inheritBackground === this.inheritBackground && sameOptionalBounds(context.bounds, this.storageBounds);
  }

  private captureRow(row: number): void {
    for (const scope of this.paintScopes) {
      if (!scope.before.has(row)) scope.before.set(row, this.rows.get(row));
    }
  }

  private mutableRow(row: number): Map<number, FrameCell> {
    this.captureRow(row);
    const current = this.rows.get(row);
    if (current !== undefined && this.mutableRows.has(row)) return current as Map<number, FrameCell>;
    const cells = new Map(current);
    this.rows.set(row, cells);
    this.mutableRows.add(row);
    return cells;
  }

  private containsRow(row: number): boolean {
    return Number.isInteger(row) && row >= 1 && row <= this.height
      && (this.storageBounds === undefined || row >= this.storageBounds.row && row < this.storageBounds.row + this.storageBounds.height);
  }

  private containsCell(row: number, column: number): boolean {
    return this.containsRow(row) && Number.isInteger(column) && column >= 1 && column <= this.width
      && (this.storageBounds === undefined || column >= this.storageBounds.column && column < this.storageBounds.column + this.storageBounds.width);
  }

  private clipRect(rect: Rect): Rect | undefined {
    const row = Math.max(1, Math.floor(rect.row));
    const column = Math.max(1, Math.floor(rect.column));
    const bottom = Math.min(this.height + 1, Math.floor(rect.row) + Math.max(0, Math.floor(rect.height)));
    const right = Math.min(this.width + 1, Math.floor(rect.column) + Math.max(0, Math.floor(rect.width)));
    const width = Math.max(0, right - column);
    const height = Math.max(0, bottom - row);
    const result = width === 0 || height === 0 ? undefined : { row, column, width, height };
    return result === undefined || this.storageBounds === undefined ? result : intersectRects(result, this.storageBounds);
  }

  private snapshotCellsAndFingerprints(canvasStyle?: TerminalStyle): {
    readonly cells: () => readonly FrameCell[];
    readonly rowFingerprints: readonly FrameRowFingerprint[];
    readonly rowIndexes: readonly FrameSnapshotRowIndex[];
    readonly work: { readonly rows: number; readonly cells: number };
  } {
    // Cache only sealed rows, including when later cursor/options validation fails.
    this.mutableRows.clear();
    const work = { rows: 0, cells: 0 };
    const rowFingerprints: FrameRowFingerprint[] = [];
    const rowIndexes: FrameSnapshotRowIndex[] = [];
    for (const row of [...this.rows.keys()].sort((left, right) => left - right)) {
      const cells = this.rows.get(row);
      if (cells === undefined) continue;
      const cached = snapshotsByRow.get(cells)?.get(canvasStyle);
      const previous = this.previousRows.get(row);
      let snapshot = cached;
      if (snapshot === undefined && previous !== undefined && sameProjectedRow(cells, previous.cells, canvasStyle)) {
        snapshot = previous;
        if (canvasStyle === undefined) this.rows.set(row, previous.cells);
      }
      if (snapshot === undefined) {
        work.rows += 1;
        work.cells += cells.size;
        let rowHash = fnvOffset;
        let terminalRowHash = fnvOffset;
        const indexedCells = new Map<number, FrameCell>();
        const renderable: FrameCell[] = [];
        for (const storedCell of [...cells.values()].sort((left, right) => left.column - right.column)) {
          const cell = effectiveCanvasCell(storedCell, canvasStyle);
          indexedCells.set(cell.column, cell);
          if (cell.continuation !== true) renderable.push(cell);
          rowHash = hashFrameCell(rowHash, cell);
          terminalRowHash = hashTerminalFrameCell(terminalRowHash, cell);
        }
        snapshot = Object.freeze({ row, cells: indexedCells, renderable: Object.freeze(renderable),
          fingerprint: hashToString(rowHash), terminalFingerprint: hashToString(terminalRowHash) });
      }
      let byStyle = snapshotsByRow.get(cells);
      if (byStyle === undefined) { byStyle = new Map(); snapshotsByRow.set(cells, byStyle); }
      byStyle.set(canvasStyle, snapshot);
      // A retained row may outlive many theme changes. Keep only the current pair
      // of raw/projected views rather than every historical canvas-style graph.
      while (byStyle.size > 2) byStyle.delete(byStyle.keys().next().value);
      rowFingerprints.push(snapshot);
      rowIndexes.push(snapshot);
    }
    return {
      work,
      cells: snapshotCellMaterializer(rowIndexes, this.instrumentation),
      rowFingerprints: Object.freeze(rowFingerprints),
      rowIndexes: Object.freeze(rowIndexes)
    };
  }

  private writeGrapheme(
    row: number,
    column: number,
    text: string,
    width: number,
    admittedStyle: TerminalStyle | undefined,
    link: TerminalLink | undefined,
    source: FrameCellSource | undefined,
  ): void {
    if (this.graphics.size > 0) this.occludeGraphics({ row, column, width: Math.max(1, width), height: 1 });
    const style = inheritedCellStyle(this.inheritBackground, this.cellAt(row, column), admittedStyle);
    for (let offset = 0; offset < width; offset += 1) {
      if (this.cellAt(row, column + offset) !== undefined) {
        this.clearCellGroup(row, column + offset, 'write');
      }
    }
    this.recordWriteSpan(row, column, Math.max(1, width));
    this.setCell(row, column, admittedFrameCell(row, column, text, width, style, link, source));
    for (let offset = 1; offset < width; offset += 1) {
      this.setCell(row, column + offset, admittedFrameCell(row, column + offset, '', 0, style, link, source, true));
    }
  }

  private appendCombining(row: number, nextColumn: number, text: string): void {
    const targetColumn = nextColumn - 1;
    if (!this.containsCell(row, targetColumn)) return;
    // Even an absent/continuation target is an input dependency: a later lower
    // paint can make this formerly no-op combining write produce visible text.
    this.captureRow(row);
    for (const scope of this.paintScopes) scope.read.addSpan(row, targetColumn, 1);
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
    else this.recordClear({ row: cell.row, column: cell.column, width, height: 1 });
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
    if (sameFrameCell(this.rows.get(row)?.get(column), cell)) return;
    this.mutableRow(row).set(column, Object.freeze(cell));
  }

  private deleteCell(row: number, column: number): void {
    if (!this.containsCell(row, column) || this.rows.get(row)?.has(column) !== true) return;
    const cells = this.mutableRow(row);
    cells.delete(column);
    if (cells.size === 0) this.rows.delete(row);
  }

  private markWritten(row: number, column: number, width: number): void {
    if (!this.containsRow(row)) return;
    const start = Math.max(1, column);
    const end = Math.min(this.width + 1, column + width);
    if (end > start) this.recordWriteSpan(row, start, end - start);
  }

  private recordWrite(rect: Rect): void {
    this.writtenCoverage.add(rect);
    for (let row = rect.row; row < rect.row + rect.height; row += 1) this.captureRow(row);
    for (const scope of this.paintScopes) scope.written.add(rect);
    for (const damage of this.damageScopes) damage.add(rect);
  }

  private recordWriteSpan(row: number, column: number, width: number): void {
    this.captureRow(row);
    this.writtenCoverage.addSpan(row, column, width);
    for (const scope of this.paintScopes) scope.written.addSpan(row, column, width);
    for (const damage of this.damageScopes) damage.addSpan(row, column, width);
  }

  private recordClear(rect: Rect): void {
    this.clearedCoverage.add(rect);
    for (let row = rect.row; row < rect.row + rect.height; row += 1) this.captureRow(row);
    for (const scope of this.paintScopes) scope.cleared.add(rect);
    for (const damage of this.damageScopes) damage.add(rect);
  }
}

function decodeGraphicRect(value: unknown, field: string): Rect {
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

function decodeGraphicFit(value: unknown): GraphicPlacement['fit'] {
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

const effectiveCanvasCells = new WeakMap<FrameCell, { readonly style: TerminalStyle; readonly cell: FrameCell }>();

function effectiveCanvasCell(cell: FrameCell, canvasStyle: TerminalStyle | undefined): FrameCell {
  if (canvasStyle === undefined) return cell;
  const cached = effectiveCanvasCells.get(cell);
  if (cached?.style === canvasStyle) return cached.cell;
  const style = effectiveCellStyle(canvasStyle, cell.style);
  if (style === cell.style) return cell;
  const projected = Object.freeze({ ...cell, style });
  effectiveCanvasCells.set(cell, { style: canvasStyle, cell: projected });
  return projected;
}

const effectiveCanvasStyles = new WeakMap<TerminalStyle, WeakMap<TerminalStyle, TerminalStyle>>();
const backgroundStyles = new WeakMap<TerminalColor, TerminalStyle>();

/** The color comes from an admitted immutable cell; inherit only its background. */
function backgroundStyle(background: TerminalColor): TerminalStyle {
  let style = backgroundStyles.get(background);
  if (style === undefined) {
    style = decodeTerminalStyle({ bg: background }, 'Frame inherited background style');
    backgroundStyles.set(background, style);
  }
  return style;
}

function inheritedCellStyle(
  inheritBackground: boolean, current: FrameCell | undefined, style: TerminalStyle | undefined,
): TerminalStyle | undefined {
  const background = inheritBackground && style?.bg === undefined ? current?.style?.bg : undefined;
  return background === undefined ? style : effectiveCellStyle(backgroundStyle(background), style);
}

function effectiveCellStyle(canvasStyle: TerminalStyle, cellStyle: TerminalStyle | undefined): TerminalStyle {
  if (cellStyle === undefined) return canvasStyle;
  let cachedByCellStyle = effectiveCanvasStyles.get(canvasStyle);
  if (cachedByCellStyle === undefined) {
    cachedByCellStyle = new WeakMap<TerminalStyle, TerminalStyle>();
    effectiveCanvasStyles.set(canvasStyle, cachedByCellStyle);
  }
  const cached = cachedByCellStyle.get(cellStyle);
  if (cached !== undefined) return cached;
  const effective = decodeTerminalStyle({ ...canvasStyle, ...cellStyle }, 'Frame effective cell style');
  cachedByCellStyle.set(cellStyle, effective);
  return effective;
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

function bufferFingerprint(
  rows: readonly FrameRowFingerprint[],
  kind: 'semantic' | 'terminal',
): string {
  let hash = fnvOffset;
  for (const row of rows) {
    hash = hashNumber(hash, row.row);
    hash = hashText(hash, kind === 'semantic' ? row.fingerprint : row.terminalFingerprint);
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
  return hashFrameCellSource(hashTerminalFrameCell(hash, cell), cell.source);
}

function hashTerminalFrameCell(hash: number, cell: FrameCell): number {
  let next = hashCodeUnit(hash, hashTagCell);
  next = hashNumber(next, cell.column);
  next = hashText(next, cell.text);
  next = hashNumber(next, cell.width);
  next = hashBoolean(next, cell.continuation === true);
  next = hashTerminalStyle(next, cell.style);
  return hashTerminalLink(next, cell.link);
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
    case 'default':
      return hashCodeUnit(hash, hashTagColorNone);
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

/** Values have already crossed the public decoder or a private admitted boundary. */
function admittedFrameCell(
  row: number, column: number, text: string, width: number,
  style: TerminalStyle | undefined, link: TerminalLink | undefined, source: FrameCellSource | undefined,
  continuation = false,
): FrameCell {
  const cell: { -readonly [Key in keyof FrameCell]: FrameCell[Key] } = { row, column, text, width };
  if (style !== undefined) cell.style = style;
  if (link !== undefined) cell.link = link;
  if (source !== undefined) cell.source = source;
  if (continuation) cell.continuation = true;
  return Object.freeze(cell);
}

function sameProjectedRow(cells: StoredRow, previous: StoredRow, canvasStyle: TerminalStyle | undefined): boolean {
  if (cells.size !== previous.size) return false;
  for (const cell of cells.values()) {
    if (!sameFrameCell(previous.get(cell.column), effectiveCanvasCell(cell, canvasStyle))) return false;
  }
  return true;
}

function sameStoredRow(left: StoredRow | undefined, right: StoredRow | undefined): boolean {
  if (left === right) return true;
  if ((left?.size ?? 0) !== (right?.size ?? 0)) return false;
  if (left !== undefined) for (const cell of left.values()) {
    if (!sameFrameCell(cell, right?.get(cell.column))) return false;
  }
  return true;
}

function sameGraphics(left: ReadonlyMap<string, GraphicPlacement>, right: ReadonlyMap<string, GraphicPlacement>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [id, placement] of left) if (right.get(id) !== placement) return false;
  return true;
}

function sameOptionalBounds(left: Rect | undefined, right: Rect | undefined): boolean {
  return left === undefined || right === undefined ? left === right : sameRect(left, right);
}

function snapshotCellMaterializer(
  rows: readonly FrameSnapshotRowIndex[], instrumentation: Pick<RenderInstrumentation, 'recordWork'> | undefined,
): () => readonly FrameCell[] {
  let output: readonly FrameCell[] | undefined;
  return () => {
    if (output !== undefined) return output;
    const cells: FrameCell[] = [];
    for (const row of rows) for (const cell of row.cells.values()) cells.push(cell);
    output = Object.freeze(cells);
    instrumentation?.recordWork?.({ kind: 'snapshot_materializations', count: 1 });
    instrumentation?.recordWork?.({ kind: 'snapshot_materialized_cells', count: output.length });
    return output;
  };
}
