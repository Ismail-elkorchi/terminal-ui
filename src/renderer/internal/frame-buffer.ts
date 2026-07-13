import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { toAccessibleSnapshot } from '../../accessibility/index.ts';
import { DirtyCoverageAccumulator } from './dirty-coverage.ts';
import { sanitizeFrameCellSource } from '../../visual/source.ts';
import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FrameCellSource } from '../../visual/source.ts';
import type { FocusPath } from './focus.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { Frame, FrameCell, FrameHitTarget } from '../model/frame.ts';
import type { Rect } from '../model/layout.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalColor, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import type { RenderTarget } from '../model/render-target.ts';

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

  clear(rect?: Rect): void;
  snapshot(options?: FrameBufferSnapshotOptions): FrameBufferSnapshot;
}

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  return new CellFrameBuffer(width, height);
}

class CellFrameBuffer implements FrameBuffer {
  readonly width: number;
  readonly height: number;

  private readonly cells: (FrameCell | undefined)[];
  private readonly writtenCoverage = new DirtyCoverageAccumulator();
  private readonly clearedCoverage = new DirtyCoverageAccumulator();

  constructor(width: number, height: number) {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    this.cells = Array.from({ length: this.width * this.height });
  }

  write(row: number, column: number, spans: readonly RenderSpan[]): void {
    if (!this.containsRow(row)) return;
    let nextColumn = Math.floor(column);
    for (const currentSpan of spans) {
      const measured = measureTextCells(currentSpan.text);
      const style = currentSpan.style;
      const link = currentSpan.link === undefined ? undefined : sanitizeTerminalLink(currentSpan.link);
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
    const accessibility = options.accessibility ?? toAccessibleSnapshot({
      source: 'tui',
      root: { id: 'frame', role: 'text', label: 'frame' }
    });
    const { cells, rowFingerprints } = this.snapshotCellsAndFingerprints();
    return {
      schemaVersion: 'terminal-ui.tui-frame.v1',
      width: this.width,
      height: this.height,
      cells,
      accessibility,
      metadata: {
        writtenBounds: this.writtenCoverage.toDirtyRegionSet(),
        clearedBounds: this.clearedCoverage.toDirtyRegionSet(),
        rowFingerprints,
        fingerprint: bufferFingerprint(rowFingerprints)
      },
      ...(options.hitTargets === undefined ? {} : { hitTargets: options.hitTargets }),
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.focusPath === undefined ? {} : { focusPath: options.focusPath })
    };
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
      for (let column = 1; column <= this.width; column += 1) {
        const cell = this.cellAt(row, column);
        if (cell !== undefined) {
          output.push(cell);
          rowHash = hashFrameCell(rowHash, cell);
        }
      }
      rowFingerprints.push({ row, fingerprint: hashToString(rowHash) });
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
    for (let offset = 0; offset < cell.width; offset += 1) {
      this.clearCellGroup(row, column + offset, 'write');
    }
    this.markWritten({ row, column, width: Math.max(1, cell.width), height: 1 });
    const mainCell: FrameCell = {
      row,
      column,
      text: cell.text,
      width: cell.width,
      ...(cell.style === undefined ? {} : { style: cell.style }),
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
        ...(cell.style === undefined ? {} : { style: cell.style }),
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
    this.markWritten({ row: target.row, column: target.column, width: Math.max(1, target.width), height: 1 });
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
      const owner = this.findWideOwner(row, column);
      if (owner !== undefined) this.deleteCellSpan(owner, coverage);
      else {
        if (coverage === 'write') this.markWritten({ row, column, width: 1, height: 1 });
        this.deleteCell(row, column);
      }
      return;
    }
    this.deleteCellSpan(current, coverage);
  }

  private findWideOwner(row: number, column: number): FrameCell | undefined {
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
    if (coverage === 'write') this.markWritten({ row: cell.row, column: cell.column, width, height: 1 });
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
    this.cells[this.index(row, column)] = cell;
  }

  private deleteCell(row: number, column: number): void {
    if (!this.containsCell(row, column)) return;
    this.cells[this.index(row, column)] = undefined;
  }

  private index(row: number, column: number): number {
    return (row - 1) * this.width + column - 1;
  }

  private markWritten(rect: Rect): void {
    const clipped = this.clipRect(rect);
    if (clipped !== undefined) this.writtenCoverage.add(clipped);
  }
}

function sanitizeTerminalLink(link: TerminalLink): TerminalLink {
  return {
    href: sanitizeTerminalText(link.href).text,
    ...(link.id === undefined ? {} : { id: sanitizeTerminalText(link.id).text })
  };
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
  let next = hashCodeUnit(hash, hashTagStyle);
  next = hashTerminalColor(next, style.fg);
  next = hashTerminalColor(next, style.bg);
  next = hashBoolean(next, style.bold === true);
  next = hashBoolean(next, style.dim === true);
  next = hashBoolean(next, style.italic === true);
  next = hashBoolean(next, style.underline === true);
  next = hashBoolean(next, style.strikethrough === true);
  next = hashBoolean(next, style.inverse === true);
  return hashBoolean(next, style.hidden === true);
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
  let next = hashCodeUnit(hash, hashTagLink);
  next = hashText(next, link.href);
  return hashText(next, link.id ?? '');
}

function hashFrameCellSource(hash: number, source: FrameCellSource | undefined): number {
  if (source === undefined) return hashCodeUnit(hash, hashTagSourceNone);
  return hashNumber(hashCodeUnit(hash, hashTagSource), frameCellSourceFingerprint(source));
}

function frameCellSourceFingerprint(source: FrameCellSource): number {
  const cached = sourceFingerprintCache.get(source);
  if (cached !== undefined) return cached;
  let next = fnvOffset;
  next = hashText(next, source.ownerId ?? '');
  next = hashText(next, source.ownerKind ?? '');
  next = hashText(next, source.family ?? '');
  next = hashText(next, source.role ?? '');
  next = hashText(next, source.part ?? '');
  next = hashText(next, source.partKind ?? '');
  next = hashText(next, source.itemId ?? '');
  next = hashNumber(next, source.itemIndex ?? -1);
  next = hashText(next, source.state ?? '');
  next = hashText(next, source.label ?? '');
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
