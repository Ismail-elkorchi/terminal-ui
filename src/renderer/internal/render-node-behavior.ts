import { textPresentationForLayout } from './layout-text-context.ts';
import type { TextPresentation } from '../../text/presentation.ts';
import type { AccessibleNode } from '../../accessibility/types.ts';
import { isAccessibleRole } from '../../accessibility/types.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import { textWidthProfileKey } from '../../text/width-profile.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type {
  FocusTarget,
  HitTarget,
  LayoutNode,
  Measurement,
  RenderFocusRelation,
  RenderInstrumentation,
} from '../contracts.ts';
import { decodeMeasurement } from '../measurement-validation.ts';
import { normalizeMeasurement, zeroMeasurement } from '../measurement.ts';
import type { RenderBudget } from '../render-budget.ts';
import { decodeComponentFocusTargets } from './component-output.ts';
import type { RenderNodeLayoutTarget } from './focus.ts';
import { structuralNodeRenderers } from './node-renderers/index.ts';
import type { StructuralRenderNodeKind } from './node-renderers/types.ts';
import { emptyRect } from './rect.ts';
import {
  renderNodeFactoryName,
  renderNodeFocusUnavailable,
  renderNodeInteractionUnavailable,
  resolveRenderNodeMessage,
} from './render-tree/node.ts';
import type {
  RenderNode,
  RenderNodeOfKind,
  RenderNodeRenderer,
  RenderNodeRenderInput,
} from './render-tree/types.ts';
import { scopedFrameSource } from './scoped-render-target.ts';
import { sameNodePhase } from './retained-dependencies.ts';

const retainedMeasurements = new WeakMap<RenderNode, {
  readonly theme: TerminalTheme;
  readonly textPresentation?: TextPresentation | undefined;
  readonly constraints: Map<string, Measurement>;
}>();

/** Carry measurement storage only after renderer-owned dependencies matched. */
export function retainRenderMeasurements(current: RenderNode, previous: RenderNode): void {
  const retained = retainedMeasurements.get(previous);
  if (retained !== undefined) retainedMeasurements.set(current, retained);
}

function rendererForRenderNode<TMessage>(renderNode: RenderNode<TMessage>): RenderNodeRenderer<TMessage> {
  if (renderNode.kind === 'component') return renderNode.definition.renderer;
  return rendererForStructuralNode(renderNode);
}

function hasKeyboardOrTextInput(renderNode: RenderNode): boolean {
  return (renderNode.keyMap !== undefined && Object.keys(renderNode.keyMap).length > 0)
    || renderNode.inputMap?.text !== undefined
    || renderNode.inputMap?.paste !== undefined;
}

function rendererForStructuralNode<TMessage, TKind extends StructuralRenderNodeKind>(
  renderNode: RenderNodeOfKind<TMessage, TKind>
): RenderNodeRenderer<TMessage, TKind> {
  return structuralNodeRenderers[renderNode.kind];
}

export function renderNodeClipsChildren(renderNode: RenderNode): boolean {
  return rendererForRenderNode(renderNode).clipChildren === true;
}

export function layoutChildBounds(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  measurements: RenderMeasurementContext,
  depth = 0,
): { readonly bounds: readonly (Rect | null)[]; readonly viewport: Rect } {
  let childViewport = renderNodeClipsChildren(renderNode)
    ? intersectRects(bounds, viewport) ?? emptyRect(bounds) : viewport;
  const children = renderNode.children ?? [];
  if (children.length === 0) return { bounds: [], viewport: childViewport };
  if (renderNode.kind !== 'component' && (bounds.width <= 0 || bounds.height <= 0)) {
    return { bounds: children.map(() => emptyRect(bounds)), viewport: childViewport };
  }
  const renderer = rendererForRenderNode(renderNode);
  if (renderer.layout === undefined) {
    throw new Error(`RenderNode "${renderNode.kind}" has children but does not define layout.`);
  }
  const measureChild = childMeasurer(children, bounds, measurements, depth);
  const childBounds = renderer.layout({
    renderNode: renderNode,
    bounds,
    viewport,
    clipChildrenTo: clip => { childViewport = intersectRects(clip, childViewport) ?? emptyRect(clip); },
    theme: measurements.theme,
    childCount: children.length,
    measureChild,
    textPresentation: measurements.textPresentation,
    widthProfile: measurements.widthProfile
  });
  return { bounds: childBounds, viewport: childViewport };
}

export function placeRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measurement: () => Measurement,
  childCount: number,
  measureChild: (index: number) => Measurement
): Rect {
  return rendererForRenderNode(renderNode).place?.({
    renderNode: renderNode,
    bounds,
    viewport,
    theme,
    measurement,
    childCount,
    measureChild,
    widthProfile
  }) ?? bounds;
}

export interface RenderMeasurementContext {
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly textPresentation?: TextPresentation | undefined;
  measure(renderNode: RenderNode, bounds: Rect, depth?: number): Measurement;
}

export function createRenderMeasurementContext(
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  budget?: RenderBudget,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
  textPresentation?: TextPresentation,
): RenderMeasurementContext {
  const cache = new WeakMap<RenderNode, Map<string, Measurement>>();
  const admitted = new WeakMap<RenderNode, boolean>();
  const canRetain = (node: RenderNode): boolean => {
    const known = admitted.get(node);
    if (known !== undefined) return known;
    const allowed = sameNodePhase(node, node, 'measurement')
      && !(node.kind === 'viewport' && node.props.measured === true)
      && (node.children ?? []).every(canRetain);
    admitted.set(node, allowed);
    return allowed;
  };
  const context: RenderMeasurementContext = {
    theme,
    textPresentation,
    widthProfile,
    measure(renderNode, bounds, depth = 0) {
      instrumentation?.recordWork?.({ kind: 'measurement_calls', count: 1 });
      const key = `${String(bounds.width)}:${String(bounds.height)}`;
      const byConstraint = cache.get(renderNode) ?? new Map<string, Measurement>();
      cache.set(renderNode, byConstraint);
      const cached = byConstraint.get(key);
      if (cached !== undefined) return cached;
      budget?.measureNode(depth);
      const reusable = canRetain(renderNode);
      let retained = reusable ? retainedMeasurements.get(renderNode) : undefined;
      if (reusable && (retained?.theme !== theme || retained.textPresentation !== textPresentation)) {
        retained = { theme, textPresentation, constraints: new Map() };
        retainedMeasurements.set(renderNode, retained);
      }
      const retainedKey = `${textWidthProfileKey(widthProfile)}:${key}`;
      const previous = retained?.constraints.get(retainedKey);
      if (previous !== undefined) {
        byConstraint.set(key, previous);
        return previous;
      }
      instrumentation?.recordWork?.({ kind: 'measurement_misses', count: 1 });
      const measurement = measureRenderNode(renderNode, {
        row: 1,
        column: 1,
        width: bounds.width,
        height: bounds.height
      }, context, depth);
      byConstraint.set(key, measurement);
      if (retained !== undefined && retained.constraints.size >= 4) {
        const oldest = retained.constraints.keys().next().value;
        if (oldest !== undefined) retained.constraints.delete(oldest);
      }
      retained?.constraints.set(retainedKey, measurement);
      return measurement;
    }
  };
  return context;
}

function measureRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  context: RenderMeasurementContext,
  depth: number,
): Measurement {
  const renderer = rendererForRenderNode(renderNode);
  const children = renderNode.children ?? [];
  const measurement = renderer.measure({
    renderNode: renderNode,
    bounds,
    theme: context.theme,
    childCount: children.length,
    measureChild: childMeasurer(children, bounds, context, depth),
    textPresentation: context.textPresentation,
    widthProfile: context.widthProfile
  });
  if (renderNode.kind === 'component') {
    return decodeMeasurement(measurement, `Component "${renderNode.id ?? renderNodeFactoryName(renderNode)}"`);
  }
  return normalizeMeasurement(measurement);
}

function childMeasurer(
  children: readonly RenderNode[],
  bounds: Rect,
  measurements: RenderMeasurementContext,
  depth: number,
): (index: number, constraints?: Rect) => Measurement {
  return (index, constraints): Measurement => {
    if (!Number.isInteger(index) || index < 0 || index >= children.length) return zeroMeasurement();
    const child = children[index];
    if (child === undefined) return zeroMeasurement();
    return measurements.measure(child, constraints ?? bounds, depth + 1);
  };
}

export function renderRenderNode(
  renderNode: RenderNode,
  input: Omit<RenderNodeRenderInput, 'renderNode'>,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
): void {
  const renderer = rendererForRenderNode(renderNode);
  instrumentation?.recordWork?.({ kind: 'render_hooks', count: 1 });
  renderer.render({ ...input, renderNode: renderNode });
}

export function accessibilityForRenderNode(
  renderNode: RenderNode,
  node: LayoutNode,
  id: string,
  focused: boolean,
  focus: RenderFocusRelation,
  focusedTargetId: string | undefined,
  children: readonly AccessibleNode[],
  accessibleNodes: ReadonlyMap<RenderNode, AccessibleNode>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
): AccessibleNode {
  const renderer = rendererForRenderNode(renderNode);
  if (renderer.accessibility === undefined) {
    throw new Error(`RenderNode "${id}" must provide accessibility or be marked decorative.`);
  }
  instrumentation?.recordWork?.({ kind: 'accessibility_hooks', count: 1 });
  const accessible = renderer.accessibility({
    renderNode: renderNode,
    layoutNode: node,
    textPresentation: textPresentationForLayout(node),
    id,
    focused,
    focus,
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    children,
    accessibleNodes,
    theme,
    widthProfile
  });
  const declaredRole = renderNode.kind === 'component'
    ? (renderNode.props as { readonly accessibleRole?: AccessibleNode['role'] }).accessibleRole
    : undefined;
  if (declaredRole !== undefined && isAccessibleRole(accessible.role) && accessible.role !== declaredRole) {
    throw new Error(
      `RenderNode "${id}" declared accessibility role "${declaredRole}" but produced "${accessible.role}".`
    );
  }
  return {
    ...accessible,
    ...(renderNode.state?.disabled === true ? { disabled: true } : {}),
    ...(renderNode.state?.busy === true ? { busy: true } : {}),
    ...(renderNode.state?.readOnly === true ? { readOnly: true } : {})
  };
}

export function focusTargetsForRenderNode(
  renderNode: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  textPresentation?: TextPresentation,
): readonly FocusTarget[] {
  if (renderNodeInteractionUnavailable(renderNode)) return [];
  const produced = rendererForRenderNode(renderNode).focusTargets?.({
    renderNode: renderNode,
    bounds,
    viewport,
    theme,
    textPresentation,
    widthProfile
  }) ?? [];
  const factoryName = renderNodeFactoryName(renderNode);
  const explicit = (renderNode.kind === 'component'
    ? decodeComponentFocusTargets(produced, renderNode.id ?? factoryName)
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
              }, {
                ...target.cursor.source,
                cellRole: 'cursor',
                partName: target.cursor.source?.partName ?? 'cursor',
                partType: target.cursor.source?.partType ?? 'cursor',
                description: target.cursor.source?.description ?? 'cursor'
              })
            }
          })
    }));
  const bounded = renderNode.kind === 'component'
    ? explicit.map((target) => ({
        ...target,
        bounds: intersectRects(target.bounds, bounds) ?? emptyRect(target.bounds)
      }))
    : explicit;
  const mayInferFocusTarget = renderNode.kind !== 'component'
    || renderNode.definition.inspection.structure === 'leaf';
  const targets = bounded.length > 0 || !hasKeyboardOrTextInput(renderNode) || !mayInferFocusTarget
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

export function hitTargetsForRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  target: RenderNodeLayoutTarget<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  if (target.bounds.width <= 0 || target.bounds.height <= 0) return [];
  if (target.layoutNode.inert) return [];
  if (renderNodeInteractionUnavailable(renderNode)) return [];
  const targets = rendererForRenderNode(renderNode).hitTargets?.({
    renderNode: renderNode,
    layoutNode: target.layoutNode,
    textPresentation: textPresentationForLayout(target.layoutNode),
    bounds: target.bounds,
    theme,
    widthProfile
  }) ?? [];
  const interactionTargets = targets
    .map((hitTarget) => withoutDisabledTargetFocus({
      ...hitTarget,
      message: (event) => resolveRenderNodeMessage(renderNode, hitTarget.message(event)) as TMessage
    }, target.layoutNode.focusTargets));
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
  return {
    id: hitTarget.id,
    bounds: hitTarget.bounds,
    message: (event) => hitTarget.message(event),
    ...(hitTarget.accepts === undefined ? {} : { accepts: hitTarget.accepts }),
    ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
    ...(hitTarget.zIndex === undefined ? {} : { zIndex: hitTarget.zIndex }),
  };
}
