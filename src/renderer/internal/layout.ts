import type { TerminalSize } from '../../geometry/types.ts';
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
import type { LayoutFocusRegion, LayoutNode } from '../contracts.ts';
import {
  focusScopeForRenderNode,
  focusTargetsForRenderNode,
  createRenderMeasurementContext,
  layoutChildBounds,
  placeRenderNode,
  renderNodeClipsChildren
} from './render-node-behavior.ts';
import type { RenderMeasurementContext } from './render-node-behavior.ts';
import { cellInsideRect, intersectRects } from './rect.ts';
import { markPaintOrderedFocusChildren } from './focus.ts';
import { markTransparentFocusLayout } from './focus-identity.ts';
import { renderNodeFactoryName } from '../model/node.ts';

export function layoutElement(
  element: Element<unknown>,
  terminalSizeOrBounds: TerminalSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): LayoutNode {
  return layoutRenderNode(toRenderNode(element), terminalSizeOrBounds, themeInput, widthProfile);
}

export function layoutRenderNode(
  renderNode: RenderNode,
  terminalSizeOrBounds: TerminalSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile
): LayoutNode {
  const theme = themeForLayout(themeInput);
  const bounds = 'columns' in terminalSizeOrBounds
    ? { row: 1, column: 1, width: terminalSizeOrBounds.columns, height: terminalSizeOrBounds.rows }
    : terminalSizeOrBounds;
  const viewportBounds = clampRect(bounds);
  const measurements = createRenderMeasurementContext(theme, widthProfile);
  return layoutNode(renderNode, viewportBounds, viewportBounds, theme, widthProfile, measurements, 0, 0, [], false);
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
  parentIdentity: readonly string[],
  ancestorInert: boolean
): LayoutNode {
  const children = renderNode.children ?? [];
  const measureChild = (index: number): import('../contracts.ts').Measurement => {
    const child = children[index];
    return child === undefined
      ? { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }
      : measurements.measure(child, bounds);
  };
  const placedBounds = placeRenderNode(
    renderNode,
    bounds,
    viewport,
    theme,
    widthProfile,
    () => measurements.measure(renderNode, bounds),
    children.length,
    measureChild
  );
  const visible = renderNode.layer?.visible !== false;
  const zIndex = parentZIndex + zIndexForRenderNode(renderNode);
  const identity = renderNode.id ?? `${renderNode.kind}:${String(ordinal)}`;
  const identityPath = [...parentIdentity, identity];
  const inert = ancestorInert || renderNode.state?.inert === true;
  const layer = {
    id: identityPath.join('/'),
    zIndex,
    bounds: placedBounds,
    underlay: underlayForRenderNode(renderNode)
  };
  if (!visible) {
    const layout: LayoutNode = {
      ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
      identity,
      factoryName: renderNodeFactoryName(renderNode),
      bounds: placedBounds,
      viewport,
      layer,
      visible: false,
      inert,
      focusable: false,
      focusTargets: [],
      children: []
    };
    const identified = renderNode.transparentFocusIdentity === true
      ? markTransparentFocusLayout(layout)
      : layout;
    return renderNode.kind === 'overlay'
      ? markPaintOrderedFocusChildren(identified)
      : identified;
  }
  const childBounds = boundsForChildren(renderNode, placedBounds, viewport, measurements);
  const focusTargets = (inert
    ? []
    : focusTargetsForRenderNode(renderNode, placedBounds, viewport, theme, widthProfile))
    .map((target): LayoutFocusRegion => {
      const clippedBounds = intersectRects(target.bounds, viewport) ?? emptyRect(target.bounds);
      return {
        id: target.id,
        bounds: clippedBounds,
        ...(target.cursor === undefined || !cellInsideRect(target.cursor, clippedBounds)
          ? {}
          : { cursor: target.cursor }),
        disabled: target.disabled === true,
        ...(target.order === undefined ? {} : { order: target.order }),
        ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
      };
    });
  const focusScope = focusScopeForRenderNode(renderNode);
  const childViewport = renderNodeClipsChildren(renderNode)
    ? intersectRects(placedBounds, viewport) ?? emptyRect(placedBounds)
    : viewport;
  const layout: LayoutNode = {
    ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
    identity,
    factoryName: renderNodeFactoryName(renderNode),
    bounds: placedBounds,
    viewport,
    layer,
    visible,
    inert,
    focusable: focusTargets.some((target) => !target.disabled && target.bounds.width > 0 && target.bounds.height > 0),
    ...(focusScope === undefined ? {} : { focusScope }),
    focusTargets,
    children: (renderNode.children ?? [])
      .map((child, index) => layoutNode(
        child,
        childBounds[index] ?? emptyRect(placedBounds),
        childViewport,
        theme,
        widthProfile,
        measurements,
        index,
        zIndex,
        identityPath,
        inert
      ))
  };
  const identified = renderNode.transparentFocusIdentity === true
    ? markTransparentFocusLayout(layout)
    : layout;
  return renderNode.kind === 'overlay'
    ? markPaintOrderedFocusChildren(identified)
    : identified;
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
