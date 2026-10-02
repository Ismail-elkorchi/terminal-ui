import type { LayerUnderlay } from '../../element/metadata.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { Rect, TerminalSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import { defaultTextWidthProfile } from '../../text/width-profile.ts';
import { defaultTheme } from '../../theme/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/theme.ts';
import { resolveThemeInput } from '../../theme/theme.ts';
import type { LayoutFocusRegion, LayoutNode, RenderInstrumentation } from '../contracts.ts';
import type { RenderBudget } from '../render-budget.ts';
import { createRenderBudget } from '../render-budget.ts';
import { markTransparentFocusLayout } from './focus-identity.ts';
import {
  markFocusRevealLayout,
  markLogicalFocusBounds,
  markPaintOrderedFocusChildren,
} from './focus.ts';
import { resolveMeasuredViewport } from './measured-viewport.ts';
import { cellInsideRect } from './rect.ts';
import type { RenderMeasurementContext } from './render-node-behavior.ts';
import {
  createRenderMeasurementContext,
  focusTargetsForRenderNode,
  layoutChildBounds,
  placeRenderNode,
  renderNodeClipsChildren,
} from './render-node-behavior.ts';
import { renderNodeFactoryName } from './render-tree/node.ts';
import type { RenderNode } from './render-tree/types.ts';

interface LaidOutRenderNode<TMessage = unknown> {
  readonly node: RenderNode<TMessage>;
  readonly layout: LayoutNode;
}

export function layoutRenderTree<TMessage>(
  renderNode: RenderNode<TMessage>,
  terminalSizeOrBounds: TerminalSize | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition,
  widthProfile: TextWidthProfile = defaultTextWidthProfile,
  budget: RenderBudget = createRenderBudget(),
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
): LaidOutRenderNode<TMessage> {
  const theme = themeForLayout(themeInput);
  const bounds = 'columns' in terminalSizeOrBounds
    ? { row: 1, column: 1, width: terminalSizeOrBounds.columns, height: terminalSizeOrBounds.rows }
    : terminalSizeOrBounds;
  const viewportBounds = clampRect(bounds);
  const measurements = createRenderMeasurementContext(theme, widthProfile, budget, instrumentation);
  const uniqueNodes = instrumentation?.recordWork === undefined ? undefined : new WeakSet<RenderNode>();
  return layoutNode(renderNode, viewportBounds, viewportBounds, theme, widthProfile, measurements, budget, 0, 0, 0, [], false, instrumentation, uniqueNodes);
}

function layoutNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  allocation: Rect | null,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measurements: RenderMeasurementContext,
  budget: RenderBudget,
  depth: number,
  ordinal: number,
  parentZIndex: number,
  parentIdentity: readonly string[],
  ancestorInert: boolean,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
  uniqueNodes?: WeakSet<RenderNode>,
): LaidOutRenderNode<TMessage> {
  budget.visitNode(depth);
  recordLayoutVisit(renderNode, instrumentation, uniqueNodes);
  const placement = placeLayoutNode(renderNode, allocation, viewport, theme, widthProfile, measurements, depth);
  renderNode = placement.node;
  const { bounds: placedBounds, visible } = placement;
  const children = renderNode.children ?? [];
  const zIndex = parentZIndex + zIndexForRenderNode(renderNode);
  const identity = renderNode.id ?? `${renderNode.kind}:${String(ordinal)}`;
  const identityPath = [...parentIdentity, identity];
  const inert = ancestorInert || renderNode.state?.inert === true;
  const layer = {
    id: encodedIdentityPath(identityPath),
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
    return { node: renderNode, layout: renderNode.kind === 'overlay'
      ? markPaintOrderedFocusChildren(identified)
      : identified };
  }
  const childBounds = boundsForChildren(renderNode, placedBounds, viewport, measurements, depth);
  const focusTargets = (inert
    ? []
    : focusTargetsForRenderNode(renderNode, placedBounds, viewport, theme, widthProfile))
    .map((target): LayoutFocusRegion => {
      const clippedBounds = intersectRects(target.bounds, viewport) ?? emptyRect(target.bounds);
      return markLogicalFocusBounds({
        id: target.id,
        bounds: clippedBounds,
        ...(target.cursor === undefined || !cellInsideRect(target.cursor, clippedBounds)
          ? {}
          : { cursor: target.cursor }),
        disabled: target.disabled === true,
        ...(target.order === undefined ? {} : { order: target.order }),
        ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
      }, target.bounds);
    });
  const focusScope = renderNode.focus?.scope;
  const childViewport = renderNodeClipsChildren(renderNode)
    ? intersectRects(placedBounds, viewport) ?? emptyRect(placedBounds)
    : viewport;
  const laidOutChildren = children.map((child, index) => layoutNode(
    child,
    childBounds[index] === undefined ? emptyRect(placedBounds) : childBounds[index],
    childViewport,
    theme,
    widthProfile,
    measurements,
    budget,
    depth + 1,
    renderNode.kind === 'measuredColumn' ? renderNode.props.entries[index]?.sourceIndex ?? index : index,
    zIndex,
    identityPath,
    inert,
    instrumentation,
    uniqueNodes,
  ));
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
    ...(renderNode.focusNavigation === undefined ? {} : { focusNavigation: renderNode.focusNavigation }),
    focusTargets,
    children: laidOutChildren.map((child) => child.layout),
  };
  const revealable = renderNode.kind === 'viewport'
    && typeof renderNode.props.toScrollMessage === 'function'
      ? markFocusRevealLayout(layout)
      : layout;
  const identified = renderNode.transparentFocusIdentity === true
    ? markTransparentFocusLayout(revealable)
    : revealable;
  return {
    node: laidOutChildren.every((child, index) => child.node === children[index])
      ? renderNode
      : { ...renderNode, children: laidOutChildren.map((child) => child.node) },
    layout: renderNode.kind === 'overlay' ? markPaintOrderedFocusChildren(identified) : identified,
  };
}

function placeLayoutNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  allocation: Rect | null,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measurements: RenderMeasurementContext,
  depth: number,
): { readonly node: RenderNode<TMessage>; readonly bounds: Rect; readonly visible: boolean } {
  if (allocation === null) return { node: renderNode, bounds: emptyRect(viewport), visible: false };
  if (renderNode.kind === 'viewport' && renderNode.props.measured === true) {
    renderNode = resolveMeasuredViewport(renderNode, allocation, measurements, depth);
  }
  const children = renderNode.children ?? [];
  const bounds = placeRenderNode(
    renderNode,
    allocation,
    viewport,
    theme,
    widthProfile,
    () => measurements.measure(renderNode, allocation, depth),
    children.length,
    (index) => {
      const child = children[index];
      return child === undefined
        ? { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }
        : measurements.measure(child, allocation, depth + 1);
    },
  );
  return { node: renderNode, bounds, visible: renderNode.layer?.visible !== false };
}

function recordLayoutVisit(
  node: RenderNode,
  instrumentation: Pick<RenderInstrumentation, 'recordWork'> | undefined,
  uniqueNodes: WeakSet<RenderNode> | undefined,
): void {
  instrumentation?.recordWork?.({ kind: 'layout_nodes', count: 1 });
  if (uniqueNodes === undefined || uniqueNodes.has(node)) return;
  uniqueNodes.add(node);
  instrumentation?.recordWork?.({ kind: 'unique_nodes', count: 1 });
}

function encodedIdentityPath(path: readonly string[]): string {
  return path.map((segment) => `${String(segment.length)}:${segment}`).join('');
}

function boundsForChildren(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  measurements: RenderMeasurementContext,
  depth: number,
): readonly (Rect | null)[] {
  const children = renderNode.children ?? [];
  return children.length === 0 ? [] : layoutChildBounds(
    renderNode,
    bounds,
    viewport,
    measurements,
    depth,
  );
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
  return resolveThemeInput(theme, defaultTheme);
}
