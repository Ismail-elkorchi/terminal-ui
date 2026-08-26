import type { Rect } from '../../geometry/types.ts';

export function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const rightEdge = Math.min(left.column + left.width, right.column + right.width);
  const width = Math.max(0, rightEdge - column);
  const height = Math.max(0, bottom - row);
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}

export function emptyRect(bounds: Rect): Rect {
  return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
}

export function cellInsideRect(
  position: { readonly row: number; readonly column: number },
  rect: Rect
): boolean {
  return position.row >= rect.row
    && position.row < rect.row + rect.height
    && position.column >= rect.column
    && position.column < rect.column + rect.width;
}
