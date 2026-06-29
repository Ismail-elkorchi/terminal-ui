import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { CanvasPainterInput } from '../widgets/types.ts';
import type { Rect } from './layout.ts';
import type { WidgetRenderInput } from './widget-renderer.ts';
import { createCanvas2D } from './canvas2d/index.ts';

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
  return (widget.children ?? []).map(() => bounds);
}

export function absoluteChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  if ((widget.children ?? []).length === 0) return [];
  const rowOffset = Math.max(1, Math.floor(numberProp(widget, 'row') ?? 1));
  const columnOffset = Math.max(1, Math.floor(numberProp(widget, 'column') ?? 1));
  const row = bounds.row + rowOffset - 1;
  const column = bounds.column + columnOffset - 1;
  return [{
    row,
    column,
    width: Math.max(0, Math.min(bounds.width - columnOffset + 1, Math.floor(numberProp(widget, 'width') ?? bounds.width - columnOffset + 1))),
    height: Math.max(0, Math.min(bounds.height - rowOffset + 1, Math.floor(numberProp(widget, 'height') ?? bounds.height - rowOffset + 1)))
  }];
}

export function overlayChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  return (widget.children ?? []).map(() => bounds);
}

export function canvasAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: stringify(widget.props['label']) || id,
    ...(focused ? { focused } : {})
  };
}

export function surfaceAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: stringify(widget.props['label']) || id,
    ...(focused ? { focused } : {})
  };
}

export function absoluteAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: id,
    ...(focused ? { focused } : {})
  };
}

export function overlayAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'application',
    label: id,
    ...(focused ? { focused } : {})
  };
}

function canvasPainter(value: unknown): ((input: CanvasPainterInput) => void) | undefined {
  if (typeof value !== 'function') return undefined;
  return value as (input: CanvasPainterInput) => void;
}
