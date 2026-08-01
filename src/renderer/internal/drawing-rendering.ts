import { stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { Rect } from '../contracts.ts';
import type { RenderNodeRenderInput } from '../model/renderer.ts';
import { createClippedCanvas2D } from './canvas2d/canvas2d.ts';
import { layoutBoxBounds, layoutPaddingBounds } from './layout-geometry.ts';
import { layoutFlowOptions } from './renderers/support/layout.ts';
import { surfaceChildContentBounds } from './surface.ts';
import { resolveRenderNodeStyle } from '../style-resolution.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { createScopedRenderTarget } from './scoped-render-target.ts';

type CanvasNode = RenderNodeOfKind<unknown, 'canvas'>;
type SurfaceNode = RenderNodeOfKind<unknown, 'surface'>;
type AbsoluteNode = RenderNodeOfKind<unknown, 'absolute'>;
type OverlayNode = RenderNodeOfKind<unknown, 'overlay'>;

export function renderCanvas(input: RenderNodeRenderInput<unknown, 'canvas'>): void {
  const owner = {
    ...(input.renderNode.id === undefined ? {} : { id: input.renderNode.id }),
    name: input.renderNode.kind,
    rendererFamily: 'canvas'
  };
  input.renderNode.props.painter({
    canvas: createClippedCanvas2D(createScopedRenderTarget(
      input.buffer,
      input.layoutNode.bounds,
      input.layoutNode.viewport,
      owner
    ), input.layoutNode.bounds),
    bounds: input.layoutNode.bounds,
    theme: input.theme,
    style: (styleInput) => resolveRenderNodeStyle(input.renderNode, styleInput),
    source: (sourceInput = {}) => renderNodeFrameSource(input.renderNode, {
      rendererFamily: 'canvas',
      cellRole: 'custom',
      ...sourceInput
    })
  });
}

export function surfaceChildBounds(renderNode: SurfaceNode, bounds: Rect): readonly Rect[] {
  const contentBounds = layoutPaddingBounds(
    surfaceChildContentBounds(renderNode, bounds),
    renderNode.props.padding
  );
  return (renderNode.children ?? []).map(() => contentBounds);
}

export function placeSurface(renderNode: SurfaceNode, bounds: Rect): Rect {
  return layoutBoxBounds(bounds, layoutFlowOptions(renderNode));
}

export function absoluteChildBounds(renderNode: AbsoluteNode, bounds: Rect): readonly Rect[] {
  if ((renderNode.children ?? []).length === 0) return [];
  const rowOffset = Math.floor(renderNode.props.row);
  const columnOffset = Math.floor(renderNode.props.column);
  const row = bounds.row + rowOffset - 1;
  const column = bounds.column + columnOffset - 1;
  const width = Math.floor(renderNode.props.width ?? bounds.column + bounds.width - column);
  const height = Math.floor(renderNode.props.height ?? bounds.row + bounds.height - row);
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

export function surfaceAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
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

function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const endColumn = Math.min(left.column + left.width, right.column + right.width);
  const width = Math.max(0, endColumn - column);
  const height = Math.max(0, bottom - row);
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}
