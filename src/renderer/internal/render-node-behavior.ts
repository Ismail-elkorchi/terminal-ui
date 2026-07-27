import type { ElementFocusScope } from '../../element/metadata.ts';
import { builtinRenderNodeRenderers } from './renderers/index.ts';
import { normalizeMeasurement, zeroMeasurement } from './measurement.ts';
import { renderNodeInteractionDisabled } from './render-node-interaction.ts';
import { pointerInteractionHitTargets } from './pointer-interaction.ts';
import {
  emptyRect, hasKeyboardOrInputMap, sameRect
} from './renderers/support/common.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { RenderNodeFocusTarget, RenderNodeLayoutTarget } from './focus.ts';
import type { LayoutNode, Rect } from '../model/layout.ts';
import type { Measurement } from './measurement.ts';
import type { FocusTarget, HitTarget, RenderNodeRenderer, RenderNodeRenderInput } from '../model/renderer.ts';

export function rendererForRenderNode<TMessage>(renderNode: RenderNode<TMessage>): RenderNodeRenderer<TMessage> {
  if (renderNode.kind === 'custom') return renderNode.custom.renderer;
  return builtinRenderNodeRenderers[renderNode.kind] as RenderNodeRenderer<TMessage>;
}

export function layoutChildBounds(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  measurements: RenderMeasurementContext
): readonly Rect[] {
  const children = renderNode.children ?? [];
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));
  const renderer = rendererForRenderNode(renderNode);
  if (renderer.layout === undefined) {
    throw new Error(`RenderNode "${renderNode.kind}" has children but does not define layout.`);
  }
  const measureChild = childMeasurer(children, bounds, measurements);
  return renderer.layout({
    renderNode: renderNode,
    bounds,
    viewport,
    theme: measurements.theme,
    childCount: children.length,
    measureChild,
    widthProfile: measurements.widthProfile
  });
}

export function placeRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): Rect {
  return rendererForRenderNode(renderNode).place?.({ renderNode: renderNode, bounds, viewport, theme, widthProfile }) ?? bounds;
}

export interface RenderMeasurementContext {
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  measure(renderNode: RenderNode, bounds: Rect): Measurement;
}

export function createRenderMeasurementContext(
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderMeasurementContext {
  const cache = new WeakMap<RenderNode, Map<string, Measurement>>();
  const context: RenderMeasurementContext = {
    theme,
    widthProfile,
    measure(renderNode, bounds) {
      const key = `${String(bounds.row)}:${String(bounds.column)}:${String(bounds.width)}:${String(bounds.height)}`;
      const byConstraint = cache.get(renderNode) ?? new Map<string, Measurement>();
      cache.set(renderNode, byConstraint);
      const cached = byConstraint.get(key);
      if (cached !== undefined) return cached;
      const measurement = measureRenderNode(renderNode, bounds, context);
      byConstraint.set(key, measurement);
      return measurement;
    }
  };
  return context;
}

function measureRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  context: RenderMeasurementContext
): Measurement {
  const renderer = rendererForRenderNode(renderNode);
  const children = renderNode.children ?? [];
  return normalizeMeasurement(renderer.measure({
    renderNode: renderNode,
    bounds,
    theme: context.theme,
    childCount: children.length,
    measureChild: childMeasurer(children, bounds, context),
    widthProfile: context.widthProfile
  }));
}

function childMeasurer(
  children: readonly RenderNode[],
  bounds: Rect,
  measurements: RenderMeasurementContext
): (index: number) => Measurement {
  const measured = new Map<number, Measurement>();
  return (index): Measurement => {
    if (!Number.isInteger(index) || index < 0 || index >= children.length) return zeroMeasurement();
    const cached = measured.get(index);
    if (cached !== undefined) return cached;
    const child = children[index];
    if (child === undefined) return zeroMeasurement();
    const measurement = measurements.measure(child, bounds);
    measured.set(index, measurement);
    return measurement;
  };
}

export function renderRenderNode(
  renderNode: RenderNode,
  input: Omit<RenderNodeRenderInput, 'renderNode'>
): void {
  rendererForRenderNode(renderNode).render({ ...input, renderNode: renderNode });
}

export function accessibilityForRenderNode(
  renderNode: RenderNode,
  node: LayoutNode,
  id: string,
  focused: boolean,
  focusedTargetId: string | undefined,
  children: readonly AccessibleNode[],
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const renderer = rendererForRenderNode(renderNode);
  if (renderer.accessibility === undefined) {
    throw new Error(`RenderNode "${id}" must provide accessibility or be marked decorative.`);
  }
  return renderer.accessibility({
    renderNode: renderNode,
    layoutNode: node,
    id,
    focused,
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    children,
    theme,
    widthProfile
  });
}

export function focusTargetsForRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly FocusTarget[] {
  if (renderNodeInteractionDisabled(renderNode)) return [];
  const explicit = rendererForRenderNode(renderNode).focusTargets?.({ renderNode: renderNode, bounds, theme, widthProfile }) ?? [];
  const targets = explicit.length > 0 || !hasKeyboardOrInputMap(renderNode)
    ? explicit
    : [{ id: 'self', bounds }];
  return targets.map((target): FocusTarget => {
    if (target.id.trim() === '') {
      throw new Error(`RenderNode "${renderNode.id ?? renderNode.kind}" returned a focus target without a non-empty id.`);
    }
    const order = target.order ?? renderNode.focus?.order;
    return {
      id: target.id,
      bounds: target.bounds,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      disabled: target.disabled === true || renderNode.focus?.disabled === true,
      ...(order === undefined ? {} : { order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
    };
  });
}

export function focusScopeForRenderNode(renderNode: RenderNode): ElementFocusScope | undefined {
  return renderNode.focus?.scope;
}

export function cursorForRenderNode(
  renderNode: RenderNode,
  target: RenderNodeFocusTarget<unknown>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): { readonly row: number; readonly column: number } | undefined {
  return target.cursor
    ?? focusTargetsForRenderNode(renderNode, target.bounds, theme, widthProfile)
      .find((item) => sameRect(item.bounds, target.bounds))?.cursor;
}

export function hitTargetsForRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  target: RenderNodeLayoutTarget<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  if (renderNodeInteractionDisabled(renderNode)) return [];
  const targets = rendererForRenderNode(renderNode).hitTargets?.({
    renderNode: renderNode,
    layoutNode: target.layoutNode,
    bounds: target.bounds,
    theme,
    widthProfile
  }) ?? [];
  const interactionTargets = pointerInteractionHitTargets(renderNode, target.bounds, targets);
  if (renderNode.kind === 'custom' || target.layoutNode.focusTargets.length !== 1) return interactionTargets;
  const focusTarget = target.layoutNode.focusTargets[0];
  if (focusTarget === undefined || focusTarget.disabled) return interactionTargets;
  return interactionTargets.map((hitTarget): HitTarget<TMessage> => hitTarget.focus === undefined
    ? { ...hitTarget, focus: { kind: 'target', targetId: focusTarget.id } }
    : hitTarget);
}
