import type { Rect } from '../../geometry/types.ts';
export { intersectRects } from '../../geometry/rect.ts';

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
