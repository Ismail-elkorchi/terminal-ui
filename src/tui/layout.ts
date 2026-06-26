import type { TerminalViewport } from '../host/index.ts';
import type { Widget, WidgetKind } from '../widgets/index.ts';
import { isWidgetFocusable, layoutChildBounds } from './widget-behavior.ts';

export interface Rect {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutNode {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly bounds: Rect;
  readonly focusable: boolean;
  readonly children: readonly LayoutNode[];
}

export function layoutWidget(widget: Widget, viewport: TerminalViewport | Rect): LayoutNode {
  const bounds = 'columns' in viewport
    ? { row: 1, column: 1, width: viewport.columns, height: viewport.rows }
    : viewport;
  return layoutNode(widget, clampRect(bounds));
}

function layoutNode(widget: Widget, bounds: Rect): LayoutNode {
  const childBounds = boundsForChildren(widget, bounds);
  return {
    ...(widget.id === undefined ? {} : { id: widget.id }),
    kind: widget.kind,
    bounds,
    focusable: isFocusable(widget),
    children: (widget.children ?? []).map((child, index) => layoutNode(child, childBounds[index] ?? emptyRect(bounds)))
  };
}

function boundsForChildren(widget: Widget, bounds: Rect): readonly Rect[] {
  const children = widget.children ?? [];
  return children.length === 0 ? [] : layoutChildBounds(widget, bounds);
}

function emptyRect(bounds: Rect): Rect {
  return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
}

function clampRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, bounds.row),
    column: Math.max(1, bounds.column),
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
}

function isFocusable(widget: Widget): boolean {
  return isWidgetFocusable(widget);
}
