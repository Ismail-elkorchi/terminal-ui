import type { CursorPosition } from '../model/cursor.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { FrameCell, TerminalStyle } from './frame.ts';

export function applyCursorStyle(buffer: FrameBuffer, cursor: CursorPosition | undefined): void {
  if (cursor?.style === undefined || !insideBuffer(buffer, cursor.row, cursor.column)) return;
  const target = cursorTargetCell(buffer, cursor.row, cursor.column);
  if (target === undefined) {
    buffer.write(cursor.row, cursor.column, [{
      text: ' ',
      style: cursor.style,
      ...(cursor.source === undefined ? {} : { source: cursor.source })
    }]);
    return;
  }
  buffer.writeCell({
    ...target,
    style: mergeCursorStyle(target.style, cursor.style)
  });
}

function cursorTargetCell(buffer: FrameBuffer, row: number, column: number): FrameCell | undefined {
  const direct = buffer.readCell(row, column);
  if (direct?.continuation !== true) return direct;
  for (let candidateColumn = column - 1; candidateColumn >= 1; candidateColumn -= 1) {
    const candidate = buffer.readCell(row, candidateColumn);
    if (candidate === undefined) return undefined;
    if (candidate.continuation === true) continue;
    return candidate.column + candidate.width > column ? candidate : undefined;
  }
  return undefined;
}

function mergeCursorStyle(base: TerminalStyle | undefined, cursor: TerminalStyle): TerminalStyle {
  return { ...base, ...cursor };
}

function insideBuffer(buffer: FrameBuffer, row: number, column: number): boolean {
  return Number.isInteger(row)
    && Number.isInteger(column)
    && row >= 1
    && row <= buffer.height
    && column >= 1
    && column <= buffer.width;
}
