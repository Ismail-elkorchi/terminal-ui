import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { CanvasPainterInput } from '../widgets/types.ts';
import type { Rect } from './layout.ts';
import type { WidgetRenderInput } from './widget-renderer.ts';
import { createCanvas2D } from './canvas2d/index.ts';
import { layoutContentBounds } from './regions.ts';
import { layoutFlowOptions } from './renderers/support/layout.ts';
import { surfaceChildContentBounds } from './surface.ts';

export function renderCanvas(input: WidgetRenderInput): void {
  const painter = canvasPainter(input.widget.props['painter']);
  if (painter === undefined) {
    throw new Error('Canvas widgets must provide a painter.');
  }
  painter({
    buffer: input.buffer,
    canvas: createCanvas2D(input.buffer, input.node.bounds),
    bounds: input.node.bounds,
    theme: input.theme,
    ...(input.widget.props['state'] === undefined ? {} : { state: input.widget.props['state'] })
  });
}

export function surfaceChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const contentBounds = layoutContentBounds(surfaceChildContentBounds(widget, bounds), layoutFlowOptions(widget));
  return (widget.children ?? []).map(() => contentBounds);
}

export function absoluteChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  if ((widget.children ?? []).length === 0) return [];
  const rowOffset = Math.floor(numberProp(widget, 'row') ?? 1);
  const columnOffset = Math.floor(numberProp(widget, 'column') ?? 1);
  const row = bounds.row + rowOffset - 1;
  const column = bounds.column + columnOffset - 1;
  const width = Math.floor(numberProp(widget, 'width') ?? bounds.column + bounds.width - column);
  const height = Math.floor(numberProp(widget, 'height') ?? bounds.row + bounds.height - row);
  const childBounds = intersectRects(bounds, {
    row,
    column,
    width: Math.max(0, width),
    height: Math.max(0, height)
  });
  return [childBounds ?? { row: bounds.row, column: bounds.column, width: 0, height: 0 }];
}

export function overlayChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  return (widget.children ?? []).map(() => bounds);
}

export function canvasAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: stringify(widget.props['label']) || id,
    scope: { kind: 'document' },
    ...(focused ? { focused } : {})
  };
}

export function surfaceAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'text',
    label: stringify(widget.props['label']) || id,
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function absoluteAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: id,
    scope: { kind: 'document' },
    ...(focused ? { focused } : {})
  };
}

export function overlayAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: id,
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {})
  };
}

function canvasPainter(value: unknown): ((input: CanvasPainterInput) => void) | undefined {
  if (typeof value !== 'function') return undefined;
  return value as (input: CanvasPainterInput) => void;
}

function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const endColumn = Math.min(left.column + left.width, right.column + right.width);
  const width = Math.max(0, endColumn - column);
  const height = Math.max(0, bottom - row);
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}
