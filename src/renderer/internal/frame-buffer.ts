import { measureTextCells, sanitizeTerminalCellText } from '../../text/index.ts';
import { toAccessibleSnapshot } from '../../accessibility/index.ts';
import { DirtyCoverageAccumulator } from './dirty-coverage.ts';
import { sanitizeFrameCellSource } from '../../visual/source.ts';
import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
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
import { defaultTextWidthProfile, defineTextWidthProfile } from '../../text/index.ts';
import { assertFrameDimensions } from './frame-limits.ts';

export interface FrameBufferOptions {
  readonly widthProfile?: TextWidthProfile;
}

export interface FrameBufferSnapshotOptions {
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility?: AccessibleSnapshot;
  readonly hitTargets?: readonly FrameHitTarget[];
}

export interface FrameRowFingerprint {
  readonly row: number;
  readonly fingerprint: string;
}

export interface FrameBufferSnapshotMetadata {
  readonly writtenBounds: DirtyRegionSet;
  readonly clearedBounds: DirtyRegionSet;
  readonly rowFingerprints: readonly FrameRowFingerprint[];
  readonly fingerprint: string;
}

export interface FrameBufferSnapshot extends Frame {
  readonly metadata: FrameBufferSnapshotMetadata;
}

export interface FrameBuffer extends RenderTarget {
  readonly width: number;
  readonly height: number;

  write(row: number, column: number, spans: readonly RenderSpan[]): void;
  writeLine(row: number, column: number, line: RenderLine): void;
  writeBlock(row: number, column: number, block: RenderBlock): void;
  writeCell(cell: FrameCell): void;
  readCell(row: number, column: number): FrameCell | undefined;

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

export function mergeableFrameCells(buffer: FrameBuffer): readonly FrameCell[] {
  if (buffer instanceof CellFrameBuffer) return buffer[mergeableCells]();
  return buffer.snapshot().cells.filter(isMergeableFrameCell);
}

const blitCell = Symbol('terminal-ui.blit-frame-cell');
const mergeableCells = Symbol('terminal-ui.mergeable-frame-cells');

class CellFrameBuffer implements FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;

  private readonly cells: (FrameCell | undefined)[];
  private readonly inheritBackground: boolean;
  private readonly mergeableCellIndexes = new Set<number>();
  private readonly writtenCoverage = new DirtyCoverageAccumulator();
  private readonly clearedCoverage = new DirtyCoverageAccumulator();

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
    this.cells = Array.from({ length: this.width * this.height });
  }

  write(row: number, column: number, spans: readonly RenderSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      const text = sanitizeTerminalCellText(currentSpan.text).text;
      const measured = measureTextCells(text, { widthProfile: this.widthProfile });
      const style = currentSpan.style;
      const link = currentSpan.link === undefined ? undefined : normalizeTerminalLink(currentSpan.link);
      const source = currentSpan.source === undefined ? undefined : sanitizeFrameCellSource(currentSpan.source);
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

  readCell(row: number, column: number): FrameCell | undefined {
    return this.cellAt(row, column);
  }

  clear(rect?: Rect): void {
    const clipped = this.clipRect(rect ?? { row: 1, column: 1, width: this.width, height: this.height });
    if (clipped === undefined) return;
    this.clearedCoverage.add(clipped);
    for (let row = clipped.row; row < clipped.row + clipped.height; row += 1) {
      for (let column = clipped.column; column < clipped.column + clipped.width; column += 1) {
        this.clearCellGroup(row, column, 'none');
      }
    }
  }

  snapshot(options: FrameBufferSnapshotOptions = {}): FrameBufferSnapshot {
    const accessibility = toAccessibleSnapshot(options.accessibility ?? {
      source: 'renderer',
      root: { id: 'frame', role: 'text', label: 'frame' }
    });
    const { cells, rowFingerprints } = this.snapshotCellsAndFingerprints();
    const cursor = options.cursor === undefined ? undefined : Object.freeze({
      ...options.cursor,
      ...(options.cursor.style === undefined
        ? {}
        : { style: normalizeTerminalStyle(options.cursor.style, 'Frame cursor style') }),
      ...(options.cursor.source === undefined
        ? {}
        : { source: sanitizeFrameCellSource(options.cursor.source) })
    });
    const frame: FrameBufferSnapshot = {
      width: this.width,
      height: this.height,
      widthProfile: this.widthProfile,
      cells,
      accessibility,
      metadata: Object.freeze({
        writtenBounds: this.writtenCoverage.toDirtyRegionSet(),
        clearedBounds: this.clearedCoverage.toDirtyRegionSet(),
        rowFingerprints,
        fingerprint: bufferFingerprint(rowFingerprints)
      }),
      ...(options.hitTargets === undefined ? {} : { hitTargets: immutableHitTargets(options.hitTargets) }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(options.focusPath === undefined ? {} : { focusPath: Object.freeze([...options.focusPath]) })
    };
    return Object.freeze(frame);
  }

  [blitCell](cell: FrameCell): void {
    if (cell.continuation === true || !this.containsCell(cell.row, cell.column)) return;
    if (cell.width < 1 || cell.column + cell.width - 1 > this.width) return;
    const text = sanitizeTerminalCellText(cell.text).text;
    if (text.length === 0) return;
    const measured = measureTextCells(text, { widthProfile: this.widthProfile });
    if (measured.graphemes.length !== 1 || measured.cells !== cell.width) return;
    this.writeGrapheme(cell.row, cell.column, {
      text,
      width: cell.width,
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: sanitizeFrameCellSource(cell.source) })
    });
  }

  [mergeableCells](): readonly FrameCell[] {
    return Object.freeze([...this.mergeableCellIndexes]
      .toSorted((left, right) => left - right)
      .flatMap((index) => {
        const cell = this.cells[index];
        return cell === undefined ? [] : [cell];
      }));
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

  private snapshotCellsAndFingerprints(): {
    readonly cells: readonly FrameCell[];
    readonly rowFingerprints: readonly FrameRowFingerprint[];
  } {
    const output: FrameCell[] = [];
    const rowFingerprints: FrameRowFingerprint[] = [];
    for (let row = 1; row <= this.height; row += 1) {
      let rowHash = fnvOffset;
      const rowOffset = (row - 1) * this.width;
      for (let column = 1; column <= this.width; column += 1) {
        const cell = this.cells[rowOffset + column - 1];
        if (cell !== undefined) {
          output.push(cell);
          rowHash = hashFrameCell(rowHash, cell);
        }
      }
      rowFingerprints.push(Object.freeze({ row, fingerprint: hashToString(rowHash) }));
    }
    return {
      cells: Object.freeze(output),
      rowFingerprints: Object.freeze(rowFingerprints)
    };
  }

  private writeGrapheme(
    row: number,
    column: number,
    cell: Omit<FrameCell, 'row' | 'column'>
  ): void {
    const existingBackground = this.inheritBackground && cell.style?.bg === undefined
      ? this.cellAt(row, column)?.style?.bg
      : undefined;
    const firstIndex = this.index(row, column);
    for (let offset = 0; offset < cell.width; offset += 1) {
      if (this.cells[firstIndex + offset] !== undefined) {
        this.clearCellGroup(row, column + offset, 'write');
      }
    }
    this.writtenCoverage.addSpan(row, column, Math.max(1, cell.width));
    const style = existingBackground === undefined
      ? cell.style
      : { ...cell.style, bg: existingBackground };
    const mainCell: FrameCell = {
      row,
      column,
      text: cell.text,
      width: cell.width,
      ...(style === undefined ? {} : { style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    };
    this.setCellAtIndex(firstIndex, mainCell);
    for (let offset = 1; offset < cell.width; offset += 1) {
      this.setCellAtIndex(firstIndex + offset, {
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
    const current = this.cells[this.index(row, column)];
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
    return this.cells[this.index(row, column)];
  }

  private setCell(row: number, column: number, cell: FrameCell): void {
    if (!this.containsCell(row, column)) return;
    this.setCellAtIndex(this.index(row, column), cell);
  }

  private setCellAtIndex(index: number, cell: FrameCell): void {
    const immutable = immutableFrameCell(cell);
    this.cells[index] = immutable;
    if (isMergeableFrameCell(immutable)) this.mergeableCellIndexes.add(index);
    else this.mergeableCellIndexes.delete(index);
  }

  private deleteCell(row: number, column: number): void {
    if (!this.containsCell(row, column)) return;
    const index = this.index(row, column);
    this.cells[index] = undefined;
    this.mergeableCellIndexes.delete(index);
  }

  private index(row: number, column: number): number {
    return (row - 1) * this.width + column - 1;
  }

  private markWritten(row: number, column: number, width: number): void {
    if (!this.containsRow(row)) return;
    const start = Math.max(1, column);
    const end = Math.min(this.width + 1, column + width);
    if (end > start) this.writtenCoverage.addSpan(row, start, end - start);
  }
}

function immutableFrameCell(cell: FrameCell): FrameCell {
  return Object.freeze({
    ...cell,
    ...(cell.style === undefined
      ? {}
      : { style: normalizeTerminalStyle(cell.style, 'Frame cell style') }),
    ...(cell.link === undefined ? {} : { link: normalizeTerminalLink(cell.link) }),
    ...(cell.source === undefined ? {} : { source: sanitizeFrameCellSource(cell.source) })
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
