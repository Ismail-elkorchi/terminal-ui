import type { ElementFocusScope } from '../../element/metadata.ts';
import { builtinRenderNodeRenderers } from './renderers/index.ts';
import { normalizeMeasurement, zeroMeasurement } from './measurement.ts';
import { measureBuiltinRenderNode } from './render-node-measure.ts';
import { renderNodeInteractionDisabled } from './render-node-interaction.ts';
import { pointerPresentationHitTargets } from './pointer-presentation.ts';
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

export function rendererForRenderNode<TMessage>(widget: RenderNode<TMessage>): RenderNodeRenderer<TMessage> {
  if (widget.kind === 'custom') return customRenderer(widget);
  return builtinRenderNodeRenderers[widget.kind] as RenderNodeRenderer<TMessage>;
}

export function layoutChildBounds(
  widget: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly Rect[] {
  const children = widget.children ?? [];
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));
  const renderer = rendererForRenderNode(widget);
  if (renderer.layout === undefined) {
    throw new Error(`RenderNode "${widget.kind}" has children but does not define layout.`);
  }
  const childMeasures = children.map((child) => measureRenderNode(child, bounds, theme, widthProfile));
  return renderer.layout({ renderNode: widget, bounds, viewport, theme, childMeasures, widthProfile });
}

export function placeRenderNode(
  widget: RenderNode,
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): Rect {
  return rendererForRenderNode(widget).place?.({ renderNode: widget, bounds, viewport, theme, widthProfile }) ?? bounds;
}

export function measureRenderNode(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): Measurement {
  const renderer = rendererForRenderNode(widget);
  if (renderer.measure !== undefined) {
    return normalizeMeasurement(renderer.measure({ renderNode: widget, bounds, theme, widthProfile }));
  }
  if (widget.kind === 'custom') return zeroMeasurement();
  return measureBuiltinRenderNode(widget, bounds, theme, widthProfile, measureRenderNode);
}

export function renderRenderNode(
  widget: RenderNode,
  input: Omit<RenderNodeRenderInput, 'renderNode'>
): void {
  rendererForRenderNode(widget).render({ ...input, renderNode: widget });
}

export function accessibilityForRenderNode(
  widget: RenderNode,
  node: LayoutNode,
  id: string,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const renderer = rendererForRenderNode(widget);
  if (renderer.accessibility === undefined) {
    throw new Error(`RenderNode "${id}" must provide accessibility or be marked decorative.`);
  }
  return renderer.accessibility({ renderNode: widget, layoutNode: node, id, focused, theme, widthProfile });
}

export function focusTargetsForRenderNode(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly FocusTarget[] {
  if (renderNodeInteractionDisabled(widget)) return [];
  const explicit = rendererForRenderNode(widget).focusTargets?.({ renderNode: widget, bounds, theme, widthProfile }) ?? [];
  const targets = explicit.length > 0 || !hasKeyboardOrInputMap(widget)
    ? explicit
    : [{ id: 'self', bounds }];
  return targets.map((target): FocusTarget => {
    if (target.id.trim() === '') {
      throw new Error(`RenderNode "${widget.id ?? widget.kind}" returned a focus target without a non-empty id.`);
    }
    const order = target.order ?? widget.focus?.order;
    return {
      id: target.id,
      bounds: target.bounds,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      disabled: target.disabled === true || widget.focus?.disabled === true,
      ...(order === undefined ? {} : { order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
    };
  });
}

export function focusScopeForRenderNode(widget: RenderNode): ElementFocusScope | undefined {
  return widget.focus?.scope;
}

export function cursorForRenderNode(
  widget: RenderNode,
  target: RenderNodeFocusTarget<unknown>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): { readonly row: number; readonly column: number } | undefined {
  return target.cursor
    ?? focusTargetsForRenderNode(widget, target.bounds, theme, widthProfile)
      .find((item) => sameRect(item.bounds, target.bounds))?.cursor;
}

export function hitTargetsForRenderNode<TMessage>(
  widget: RenderNode<TMessage>,
  target: RenderNodeLayoutTarget<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  if (renderNodeInteractionDisabled(widget)) return [];
  const targets = rendererForRenderNode(widget).hitTargets?.({
    renderNode: widget,
    layoutNode: target.layoutNode,
    bounds: target.bounds,
    theme,
    widthProfile
  }) ?? [];
  const presented = pointerPresentationHitTargets(widget, target.bounds, targets);
  if (widget.kind === 'custom' || target.layoutNode.focusTargets.length !== 1) return presented;
  const focusTarget = target.layoutNode.focusTargets[0];
  if (focusTarget === undefined || focusTarget.disabled) return presented;
  return presented.map((hitTarget): HitTarget<TMessage> => hitTarget.focus === undefined
    ? { ...hitTarget, focus: { kind: 'target', targetId: focusTarget.id } }
    : hitTarget);
}

function customRenderer<TMessage>(widget: RenderNode<TMessage>): RenderNodeRenderer<TMessage> {
  const renderer = widget.custom?.renderer;
  if (renderer === undefined) {
    throw new Error('Custom renderers must provide a renderer.');
  }
  return renderer;
}
