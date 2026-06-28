import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import type { FrameCell } from '../../frame.ts';
import type { Rect } from '../../layout.ts';
import type { FocusTarget, HitTarget } from '../../widget-renderer.ts';

export function hasKeyboardOrInputMap(widget: Widget): boolean {
  return (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0)
    || widget.inputMap?.text !== undefined
    || widget.inputMap?.paste !== undefined;
}

export function widgetMessageHitTargets<TMessage>(
  widget: Widget<TMessage>,
  bounds: Rect,
  suffix: string
): readonly HitTarget<TMessage>[] {
  if (bounds.width <= 0 || bounds.height <= 0) return [];
  if (widget.props['message'] === undefined) return [];
  return [{
    id: `${widget.id ?? widget.kind}:${suffix}`,
    bounds,
    message: widget.props['message'] as TMessage,
    cursor: 'pointer'
  }];
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function groupAccessibleNode(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    ...(focused ? { focused } : {})
  };
}

export function focusTarget(
  bounds: Rect,
  cursor?: { readonly row: number; readonly column: number }
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

export function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}
