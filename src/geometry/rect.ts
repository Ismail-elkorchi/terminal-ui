import type { Rect } from './types.ts';

/** Intersection of two rectangles in the same coordinate space. */
export function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const edge = Math.min(left.column + left.width, right.column + right.width);
  return bottom <= row || edge <= column
    ? undefined
    : { row, column, width: edge - column, height: bottom - row };
}

export function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.width > 0 && left.height > 0 && right.width > 0 && right.height > 0
    && left.row < right.row + right.height
    && left.row + left.height > right.row
    && left.column < right.column + right.width
    && left.column + left.width > right.column;
}

export function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row && left.column === right.column
    && left.width === right.width && left.height === right.height;
}
