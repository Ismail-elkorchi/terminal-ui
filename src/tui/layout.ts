import type { TerminalViewport } from '../host/index.ts';
import type { Widget, WidgetKind } from '../widgets/index.ts';
import { numberProp } from './widget-props.ts';

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
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));

  if (widget.kind === 'row') {
    return splitHorizontal(bounds, children.length);
  }
  if (widget.kind === 'box') {
    return children.map(() => inset(bounds, 1));
  }
  if (widget.kind === 'viewport') {
    return children.map(() => viewportChildBounds(widget, bounds));
  }
  return splitVertical(bounds, children.length);
}

function viewportChildBounds(widget: Widget, bounds: Rect): Rect {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(
    bounds.height + scrollRow,
    nonNegativeInteger(numberProp(widget, 'contentRows'))
  );
  const contentColumns = Math.max(
    bounds.width + scrollColumn,
    nonNegativeInteger(numberProp(widget, 'contentColumns'))
  );
  return {
    row: bounds.row - scrollRow,
    column: bounds.column - scrollColumn,
    width: contentColumns,
    height: contentRows
  };
}

function splitVertical(bounds: Rect, count: number): readonly Rect[] {
  const base = Math.max(1, Math.floor(bounds.height / count));
  let row = bounds.row;
  return Array.from({ length: count }, (_value, index) => {
    const remaining = bounds.row + bounds.height - row;
    const height = index === count - 1 ? remaining : Math.min(base, remaining);
    const rect = { row, column: bounds.column, width: bounds.width, height: Math.max(0, height) };
    row += height;
    return clampRect(rect);
  });
}

function splitHorizontal(bounds: Rect, count: number): readonly Rect[] {
  const base = Math.max(1, Math.floor(bounds.width / count));
  let column = bounds.column;
  return Array.from({ length: count }, (_value, index) => {
    const remaining = bounds.column + bounds.width - column;
    const width = index === count - 1 ? remaining : Math.min(base, remaining);
    const rect = { row: bounds.row, column, width: Math.max(0, width), height: bounds.height };
    column += width;
    return clampRect(rect);
  });
}

function inset(bounds: Rect, amount: number): Rect {
  return clampRect({
    row: bounds.row + amount,
    column: bounds.column + amount,
    width: bounds.width - amount * 2,
    height: bounds.height - amount * 2
  });
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
  return widget.kind === 'inputField'
    || widget.kind === 'list'
    || (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0);
}

function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}
