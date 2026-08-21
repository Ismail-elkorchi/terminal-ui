import type { AccessibleNode } from '../../../../accessibility/index.ts';
import type { RenderNode } from '../../../model/index.ts';
import type { CursorPosition } from '../../../contracts.ts';
import type { FrameCell } from '../../frame.ts';
import type { Rect } from '../../../contracts.ts';
import type { FocusTarget } from '../../../contracts.ts';

export function hasKeyboardOrInputMap(renderNode: RenderNode): boolean {
  return (renderNode.keyMap !== undefined && Object.keys(renderNode.keyMap).length > 0)
    || renderNode.inputMap?.text !== undefined
    || renderNode.inputMap?.paste !== undefined;
}

export function groupAccessibleNode(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'group',
    ...(focused ? { focused } : {})
  };
}

export function focusTarget(
  bounds: Rect,
  cursor?: CursorPosition
): FocusTarget {
  return {
    id: 'self',
    bounds,
    ...(cursor === undefined ? {} : { cursor })
  };
}

export function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}

export function emptyRect(bounds: Rect): Rect {
  return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
}

export function clampRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, bounds.row),
    column: Math.max(1, bounds.column),
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
}

export function cellInside(cell: FrameCell, bounds: Rect): boolean {
  return cell.row >= bounds.row
    && cell.row < bounds.row + bounds.height
    && cell.column >= bounds.column
    && cell.column < bounds.column + bounds.width;
}
