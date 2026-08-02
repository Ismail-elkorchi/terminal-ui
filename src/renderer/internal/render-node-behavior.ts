import type { ElementFocusScope } from '../../element/metadata.ts';
import { builtinRenderNodeRenderers } from './renderers/index.ts';
import { normalizeMeasurement, zeroMeasurement } from './measurement.ts';
import {
  renderNodeFactoryName,
  renderNodeFocusUnavailable,
  renderNodeInteractionUnavailable
} from '../model/node.ts';
import { pointerInteractionHitTargets } from './pointer-interaction.ts';
import {
  emptyRect, hasKeyboardOrInputMap
} from './renderers/support/common.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { RenderNodeLayoutTarget } from './focus.ts';
import type { LayoutNode, Rect } from '../contracts.ts';
import type { FocusTarget, HitTarget, Measurement } from '../contracts.ts';
import type { RenderNodeRenderer, RenderNodeRenderInput } from '../model/renderer.ts';
import type { RenderNodeOfKind } from '../model/types.ts';
import type { BuiltinRenderNodeKind } from './renderers/types.ts';
import {
  assertValidComponentHitTargets,
  normalizeComponentFocusTargets
} from './component-output.ts';
import { assertValidMeasurement } from '../measurement-validation.ts';
import { intersectRects } from './rect.ts';
import { scopedFrameSource } from './scoped-render-target.ts';

function rendererForRenderNode<TMessage>(renderNode: RenderNode<TMessage>): RenderNodeRenderer<TMessage> {
  if (renderNode.kind === 'component') return renderNode.definition.renderer;
  return rendererForBuiltinRenderNode(renderNode);
}

function rendererForBuiltinRenderNode<TMessage, TKind extends BuiltinRenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>
): RenderNodeRenderer<TMessage, TKind> {
  return builtinRenderNodeRenderers[renderNode.kind];
}

export function renderNodeClipsChildren(renderNode: RenderNode): boolean {
  return rendererForRenderNode(renderNode).clipChildren === true;
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
  widthProfile: TextWidthProfile,
  measurement: () => Measurement
): Rect {
  return rendererForRenderNode(renderNode).place?.({
    renderNode: renderNode,
    bounds,
    viewport,
    theme,
    measurement,
    widthProfile
  }) ?? bounds;
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
  const measurement = renderer.measure({
    renderNode: renderNode,
    bounds,
    theme: context.theme,
    childCount: children.length,
    measureChild: childMeasurer(children, bounds, context),
    widthProfile: context.widthProfile
  });
  if (renderNode.kind === 'component') {
    assertValidMeasurement(measurement, `Component "${renderNode.id ?? renderNodeFactoryName(renderNode)}"`);
  }
  return normalizeMeasurement(measurement);
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
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly FocusTarget[] {
  if (renderNodeInteractionUnavailable(renderNode)) return [];
  const produced = rendererForRenderNode(renderNode).focusTargets?.({
    renderNode: renderNode,
    bounds,
    viewport,
    theme,
    widthProfile
  }) ?? [];
  const factoryName = renderNodeFactoryName(renderNode);
  const explicit = (renderNode.kind === 'component'
    ? normalizeComponentFocusTargets(produced, renderNode.id ?? factoryName)
    : produced)
    .map((target): FocusTarget => ({
      ...target,
      ...(target.cursor === undefined || renderNode.kind !== 'component'
        ? {}
        : {
            cursor: {
              ...target.cursor,
              source: scopedFrameSource({
                ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
                name: factoryName,
                rendererFamily: 'component'
              }, target.cursor.source)
            }
          })
    }));
  const bounded = renderNode.kind === 'component'
    ? explicit.map((target) => ({
        ...target,
        bounds: intersectRects(target.bounds, bounds) ?? emptyRect(target.bounds)
      }))
    : explicit;
  const targets = bounded.length > 0 || !hasKeyboardOrInputMap(renderNode)
    ? bounded
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
      disabled: renderNodeFocusUnavailable(renderNode, target.disabled === true),
      ...(order === undefined ? {} : { order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
    };
  });
}

export function focusScopeForRenderNode(renderNode: RenderNode): ElementFocusScope | undefined {
  return renderNode.focus?.scope;
}

export function hitTargetsForRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  target: RenderNodeLayoutTarget<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  if (target.bounds.width <= 0 || target.bounds.height <= 0) return [];
  if (renderNodeInteractionUnavailable(renderNode)) return [];
  const targets = rendererForRenderNode(renderNode).hitTargets?.({
    renderNode: renderNode,
    layoutNode: target.layoutNode,
    bounds: target.bounds,
    theme,
    widthProfile
  }) ?? [];
  if (renderNode.kind === 'component') {
    assertValidComponentHitTargets(targets, renderNode.id ?? renderNodeFactoryName(renderNode));
  }
  const interactionTargets = pointerInteractionHitTargets(renderNode, target.bounds, targets)
    .map((hitTarget) => withoutDisabledTargetFocus(hitTarget, target.layoutNode.focusTargets));
  if (renderNode.kind === 'component' || target.layoutNode.focusTargets.length !== 1) {
    return interactionTargets;
  }
  const focusTarget = target.layoutNode.focusTargets[0];
  if (focusTarget === undefined || focusTarget.disabled) return interactionTargets;
  return interactionTargets.map((hitTarget): HitTarget<TMessage> => hitTarget.focus === undefined
    ? { ...hitTarget, focus: { kind: 'target', targetId: focusTarget.id } }
    : hitTarget);
}

function withoutDisabledTargetFocus<TMessage>(
  hitTarget: HitTarget<TMessage>,
  focusTargets: readonly FocusTarget[]
): HitTarget<TMessage> {
  const focus = hitTarget.focus;
  if (focus?.kind !== 'target') return hitTarget;
  const target = focusTargets.find((candidate) => candidate.id === focus.targetId);
  if (target?.disabled !== true) return hitTarget;
  const { focus: disabledFocus, ...withoutFocus } = hitTarget;
  void disabledFocus;
  return withoutFocus;
}
