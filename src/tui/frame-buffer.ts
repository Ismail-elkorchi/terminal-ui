import { measureTextCells } from '../text/index.ts';
import { toAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
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

export interface FrameBuffer {
  readonly width: number;
  readonly height: number;

  write(row: number, column: number, spans: readonly RenderSpan[]): void;
  writeLine(row: number, column: number, line: RenderLine): void;
  writeBlock(row: number, column: number, block: RenderBlock): void;
  writeCell(cell: FrameCell): void;

  clear(rect?: Rect): void;
  snapshot(options?: FrameBufferSnapshotOptions): Frame;
}

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  return new CellFrameBuffer(width, height);
}

class CellFrameBuffer implements FrameBuffer {
  readonly width: number;
  readonly height: number;

  private readonly cells = new Map<string, FrameCell>();

  constructor(width: number, height: number) {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
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
    const bounds = rect ?? { row: 1, column: 1, width: this.width, height: this.height };
    const rowStart = Math.max(1, Math.floor(bounds.row));
    const rowEnd = Math.min(this.height, rowStart + Math.max(0, Math.floor(bounds.height)) - 1);
    const columnStart = Math.max(1, Math.floor(bounds.column));
    const columnEnd = Math.min(this.width, columnStart + Math.max(0, Math.floor(bounds.width)) - 1);
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = columnStart; column <= columnEnd; column += 1) {
        this.clearCellGroup(row, column);
      }
    }
  }

  snapshot(options: FrameBufferSnapshotOptions = {}): Frame {
    const accessibility = options.accessibility ?? toAccessibleSnapshot({
      source: 'tui',
      root: { id: 'frame', role: 'text', label: 'frame' }
    });
    return {
      schemaVersion: 'terminal-ui.tui-frame.v1',
      width: this.width,
      height: this.height,
      cells: Object.freeze([...this.cells.values()].sort(compareFrameCells)),
      accessibility,
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

  private writeGrapheme(
    row: number,
    column: number,
    cell: Omit<FrameCell, 'row' | 'column'>
  ): void {
    for (let offset = 0; offset < cell.width; offset += 1) {
      this.clearCellGroup(row, column + offset);
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
    this.cells.set(key(row, column), mainCell);
    for (let offset = 1; offset < cell.width; offset += 1) {
      this.cells.set(key(row, column + offset), {
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
    const target = this.cells.get(key(row, targetColumn));
    if (target === undefined || target.continuation === true) return;
    this.cells.set(key(row, targetColumn), {
      ...target,
      text: `${target.text}${text}`
    });
  }

  private clearCellGroup(row: number, column: number): void {
    if (!this.containsCell(row, column)) return;
    const current = this.cells.get(key(row, column));
    if (current === undefined) return;
    if (current.continuation === true) {
      const owner = this.findWideOwner(row, column);
      if (owner !== undefined) this.deleteCellSpan(owner);
      else this.cells.delete(key(row, column));
      return;
    }
    this.deleteCellSpan(current);
  }

  private findWideOwner(row: number, column: number): FrameCell | undefined {
    for (let candidateColumn = column - 1; candidateColumn >= 1; candidateColumn -= 1) {
      const candidate = this.cells.get(key(row, candidateColumn));
      if (candidate === undefined) continue;
      if (candidate.continuation === true) continue;
      return candidate.column + candidate.width > column ? candidate : undefined;
    }
    return undefined;
  }

  private deleteCellSpan(cell: FrameCell): void {
    const width = Math.max(1, cell.width);
    for (let offset = 0; offset < width; offset += 1) {
      this.cells.delete(key(cell.row, cell.column + offset));
    }
  }
}

function key(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

function compareFrameCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}
