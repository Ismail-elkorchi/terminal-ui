import { numberProp, stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { CanvasPainterInput } from '../model/canvas.ts';
import type { Rect } from '../model/layout.ts';
import type { RenderNodeRenderInput } from '../model/renderer.ts';
import { createCanvas2D } from './canvas2d/index.ts';
import { layoutContentBounds } from './layout-geometry.ts';
import { layoutFlowOptions } from './renderers/support/layout.ts';
import { surfaceChildContentBounds } from './surface.ts';

type CanvasNode = RenderNodeOfKind<unknown, 'canvas'>;
type SurfaceNode = RenderNodeOfKind<unknown, 'surface'>;
type AbsoluteNode = RenderNodeOfKind<unknown, 'absolute'>;
type OverlayNode = RenderNodeOfKind<unknown, 'overlay'>;

export function renderCanvas(input: RenderNodeRenderInput<unknown, 'canvas'>): void {
  const painter = canvasPainter(input.renderNode.props.painter);
  if (painter === undefined) {
    throw new Error('Canvas renderNodes must provide a painter.');
  }
  painter({
    canvas: createCanvas2D(input.buffer, input.layoutNode.bounds),
    bounds: input.layoutNode.bounds,
    theme: input.theme
  });
}

export function surfaceChildBounds(renderNode: SurfaceNode, bounds: Rect): readonly Rect[] {
  const contentBounds = layoutContentBounds(surfaceChildContentBounds(renderNode, bounds), layoutFlowOptions(renderNode));
  return (renderNode.children ?? []).map(() => contentBounds);
}

export function absoluteChildBounds(renderNode: AbsoluteNode, bounds: Rect): readonly Rect[] {
  if ((renderNode.children ?? []).length === 0) return [];
  const rowOffset = Math.floor(numberProp(renderNode, 'row') ?? 1);
  const columnOffset = Math.floor(numberProp(renderNode, 'column') ?? 1);
  const row = bounds.row + rowOffset - 1;
  const column = bounds.column + columnOffset - 1;
  const width = Math.floor(numberProp(renderNode, 'width') ?? bounds.column + bounds.width - column);
  const height = Math.floor(numberProp(renderNode, 'height') ?? bounds.row + bounds.height - row);
  const childBounds = intersectRects(bounds, {
    row,
    column,
    width: Math.max(0, width),
    height: Math.max(0, height)
  });
  return [childBounds ?? { row: bounds.row, column: bounds.column, width: 0, height: 0 }];
}

export function overlayChildBounds(renderNode: OverlayNode, bounds: Rect): readonly Rect[] {
  return (renderNode.children ?? []).map(() => bounds);
}

export function canvasAccessibleBase(renderNode: CanvasNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'image',
    label: stringify(renderNode.props.label) || id,
    scope: { kind: 'document' },
    ...(focused ? { focused } : {})
  };
}

export function surfaceAccessibleBase(renderNode: SurfaceNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'text',
    label: stringify(renderNode.props.label) || id,
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
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
