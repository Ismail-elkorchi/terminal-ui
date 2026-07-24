import type { ViewportSize } from '../../geometry/types.ts';
import type { LayerUnderlay } from '../../element/metadata.ts';
import type { Rect } from '../../geometry/types.ts';
export type { Rect } from '../../geometry/types.ts';
import type { RenderNode } from '../model/index.ts';
import type { Element } from '../../element/index.ts';
import { toRenderNode } from '../model/element.ts';
import { defaultTheme, defineTheme, isTerminalTheme } from '../../theme/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import { defaultTextWidthProfile } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { LayoutFocusRegion, LayoutNode } from '../model/layout.ts';
import {
  focusScopeForRenderNode,
  focusTargetsForRenderNode,
  createRenderMeasurementContext,
  layoutChildBounds,
  placeRenderNode
} from './render-node-behavior.ts';
import type { RenderMeasurementContext } from './render-node-behavior.ts';

export type { Layer, LayoutFocusRegion, LayoutNode } from '../model/layout.ts';

export function layoutElement(
  element: Element,
  viewport: ViewportSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): LayoutNode {
  return layoutRenderNode(toRenderNode(element), viewport, themeInput, widthProfile);
}

export function layoutRenderNode(
  renderNode: RenderNode,
  viewport: ViewportSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): LayoutNode {
  const theme = themeForLayout(themeInput);
  const bounds = 'columns' in viewport
    ? { row: 1, column: 1, width: viewport.columns, height: viewport.rows }
    : viewport;
  const viewportBounds = clampRect(bounds);
  const measurements = createRenderMeasurementContext(theme, widthProfile);
  return layoutNode(renderNode, viewportBounds, viewportBounds, theme, widthProfile, measurements, 0, 0, []);
}

function layoutNode(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measurements: RenderMeasurementContext,
  ordinal: number,
  parentZIndex: number,
  parentIdentity: readonly string[]
): LayoutNode {
  const placedBounds = placeRenderNode(renderNode, bounds, viewport, theme, widthProfile);
  const visible = renderNode.layer?.visible !== false;
  const zIndex = parentZIndex + zIndexForRenderNode(renderNode);
  const identity = renderNode.id ?? `${renderNode.kind}:${String(ordinal)}`;
  const identityPath = [...parentIdentity, identity];
  const layer = {
    id: identityPath.join('/'),
    zIndex,
    bounds: placedBounds,
    underlay: underlayForRenderNode(renderNode)
  };
  if (!visible) {
    return {
      ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
      identity,
      kind: renderNode.kind,
      bounds: placedBounds,
      viewport,
      layer,
      visible: false,
      focusable: false,
      focusTargets: [],
      children: []
    };
  }
  const childBounds = boundsForChildren(renderNode, placedBounds, viewport, measurements);
  const focusTargets = focusTargetsForRenderNode(renderNode, placedBounds, theme, widthProfile).map((target): LayoutFocusRegion => ({
    id: target.id,
    bounds: target.bounds,
    ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
    disabled: target.disabled === true,
    ...(target.order === undefined ? {} : { order: target.order }),
    ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
  }));
  const focusScope = focusScopeForRenderNode(renderNode);
  return {
    ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
    identity,
    kind: renderNode.kind,
    bounds: placedBounds,
    viewport,
    layer,
    visible,
    focusable: focusTargets.some((target) => !target.disabled && target.bounds.width > 0 && target.bounds.height > 0),
    ...(focusScope === undefined ? {} : { focusScope }),
    focusTargets,
    children: (renderNode.children ?? [])
      .map((child, index) => layoutNode(
        child,
        childBounds[index] ?? emptyRect(placedBounds),
        viewport,
        theme,
        widthProfile,
        measurements,
        index,
        zIndex,
        identityPath
      ))
  };
}

function boundsForChildren(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  measurements: RenderMeasurementContext
): readonly Rect[] {
  const children = renderNode.children ?? [];
  return children.length === 0 ? [] : layoutChildBounds(renderNode, bounds, viewport, measurements);
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

function zIndexForRenderNode(renderNode: RenderNode): number {
  const zIndex = renderNode.layer?.zIndex;
  return zIndex === undefined || !Number.isFinite(zIndex) ? 0 : zIndex;
}

function underlayForRenderNode(renderNode: RenderNode): LayerUnderlay {
  return renderNode.layer?.underlay ?? 'preserve';
}

function themeForLayout(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defaultTheme;
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}
