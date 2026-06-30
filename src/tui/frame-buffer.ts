import { measureTextCells } from '../text/index.ts';
import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FocusPath } from './focus.ts';
import type { CursorPosition, Frame, FrameCell, FrameHitTarget } from './frame.ts';
import type { Rect } from './layout.ts';
import type { RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';

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

export interface FrameBuffer {
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
  private writtenBounds: DirtyRegionSet = createDirtyRegionSet();
  private clearedBounds: DirtyRegionSet = createDirtyRegionSet();

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
      for (const segment of measured.graphemes) {
        if (segment.cells === 0) {
          this.appendCombining(row, nextColumn, segment.text);
          continue;
        }
        if (nextColumn >= 1 && nextColumn + segment.cells - 1 <= this.width) {
          this.writeGrapheme(row, nextColumn, {
            text: segment.text,
            width: segment.cells,
            ...(currentSpan.style === undefined ? {} : { style: currentSpan.style }),
            ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
            ...(currentSpan.source === undefined ? {} : { source: currentSpan.source })
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
    this.clearedBounds = this.clearedBounds.add(clipped);
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
    const cells = Object.freeze(this.snapshotCells());
    const rowFingerprints = Object.freeze(rowFingerprintsForCells(cells, this.height));
    return {
      schemaVersion: 'terminal-ui.tui-frame.v1',
      width: this.width,
      height: this.height,
      cells,
      accessibility,
      metadata: {
        writtenBounds: this.writtenBounds,
        clearedBounds: this.clearedBounds,
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

  private snapshotCells(): readonly FrameCell[] {
    const output: FrameCell[] = [];
    for (let row = 1; row <= this.height; row += 1) {
      for (let column = 1; column <= this.width; column += 1) {
        const cell = this.cellAt(row, column);
        if (cell !== undefined) output.push(cell);
      }
    }
    return output;
  }

  private writeGrapheme(
    row: number,
    column: number,
    cell: Omit<FrameCell, 'row' | 'column'>
  ): void {
    for (let offset = 0; offset < cell.width; offset += 1) {
      this.clearCellGroup(row, column + offset, 'write');
    }
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
    this.markWritten({ row, column, width: 1, height: 1 });
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
    if (clipped !== undefined) this.writtenBounds = this.writtenBounds.add(clipped);
  }
}

function rowFingerprintsForCells(cells: readonly FrameCell[], height: number): readonly FrameRowFingerprint[] {
  const rows = new Map<number, FrameCell[]>();
  for (const cell of cells) rows.set(cell.row, [...(rows.get(cell.row) ?? []), cell]);
  return Array.from({ length: height }, (_value, index): FrameRowFingerprint => {
    const row = index + 1;
    const rowCells = rows.get(row)?.toSorted((left, right) => left.column - right.column) ?? [];
    return {
      row,
      fingerprint: hashString(rowCells.map(cellFingerprintInput).join('|'))
    };
  });
}

function bufferFingerprint(rows: readonly FrameRowFingerprint[]): string {
  return hashString(rows.map((row) => `${String(row.row)}:${row.fingerprint}`).join('|'));
}

function cellFingerprintInput(cell: FrameCell): string {
  return stableString([
    cell.column,
    cell.text,
    cell.width,
    cell.continuation === true,
    cell.style,
    cell.link,
    cell.source
  ]);
}

function stableString(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${stringLiteral(key)}:${stableString(entry)}`)
      .join(',')}}`;
  }
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'function') return 'function';
  return 'unknown';
}

function stringLiteral(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')}"`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
