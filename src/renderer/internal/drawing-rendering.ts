import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNodeOfKind } from './render-tree/index.ts';
import type { Rect } from '../contracts.ts';
import { layoutBoxBounds, layoutPaddingBounds } from '../../geometry/layout.ts';
import { layoutFlowOptions } from './node-renderers/support/layout.ts';
import { surfaceChildContentBounds } from './surface.ts';
type SurfaceNode = RenderNodeOfKind<unknown, 'surface'>;
type AbsoluteNode = RenderNodeOfKind<unknown, 'absolute'>;
type OverlayNode = RenderNodeOfKind<unknown, 'overlay'>;

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

export function surfaceAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'group',
    ...(focused ? { focused } : {})
  };
}

export function absoluteAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'group',
    ...(focused ? { focused } : {})
  };
}

export function overlayAccessibleBase(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'group',
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
