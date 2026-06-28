import { builtinWidgetRenderers } from './renderers/index.ts';
import { measureBuiltinWidget, sanitizeWidgetMeasure, zeroWidgetMeasure } from './widget-measure.ts';
import {
  emptyRect,
  hasKeyboardOrInputMap,
  sameRect
} from './renderers/support/common.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget, WidgetFocusScope } from '../widgets/index.ts';
import type { WidgetLayoutTarget } from './focus.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { FocusTarget, HitTarget, WidgetMeasureResult, WidgetRenderer, WidgetRenderInput } from './widget-renderer.ts';

export function widgetRenderer<TMessage>(widget: Widget<TMessage>): WidgetRenderer<TMessage> {
  if (widget.kind === 'custom') return customRenderer(widget);
  return builtinWidgetRenderers[widget.kind] as WidgetRenderer<TMessage>;
}

export function layoutChildBounds(widget: Widget, bounds: Rect, theme: TerminalTheme): readonly Rect[] {
  const children = widget.children ?? [];
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));
  const renderer = widgetRenderer(widget);
  if (renderer.layout === undefined) {
    throw new Error(`Widget "${widget.kind}" has children but does not define layout.`);
  }
  const childMeasures = children.map((child) => widgetMeasure(child, bounds, theme));
  return renderer.layout({ widget, bounds, theme, childMeasures });
}

export function widgetMeasure(widget: Widget, bounds: Rect, theme: TerminalTheme): WidgetMeasureResult {
  const renderer = widgetRenderer(widget);
  if (renderer.measure !== undefined) return sanitizeWidgetMeasure(renderer.measure({ widget, bounds, theme }));
  if (widget.kind === 'custom') return zeroWidgetMeasure();
  return measureBuiltinWidget(widget, bounds, theme, widgetMeasure);
}

export function renderWidgetRenderer(
  widget: Widget,
  input: Omit<WidgetRenderInput, 'widget'>
): void {
  widgetRenderer(widget).render({ ...input, widget });
}

export function widgetAccessibleNode(
  widget: Widget,
  node: LayoutNode,
  id: string,
  focused: boolean,
  theme: TerminalTheme
): AccessibleNode {
  const renderer = widgetRenderer(widget);
  if (renderer.accessibility === undefined) {
    throw new Error(`Widget "${id}" must provide accessibility or be marked decorative.`);
  }
  return renderer.accessibility({ widget, node, id, focused, theme });
}

export function widgetFocusTargets(widget: Widget, bounds: Rect, theme: TerminalTheme): readonly FocusTarget[] {
  const explicit = widgetRenderer(widget).focusTargets?.({ widget, bounds, theme }) ?? [];
  const targets = explicit.length > 0 || !hasKeyboardOrInputMap(widget)
    ? explicit
    : [{ id: 'self', bounds }];
  return targets.map((target): FocusTarget => {
    if (target.id.trim() === '') {
      throw new Error(`Widget "${widget.id ?? widget.kind}" returned a focus target without a non-empty id.`);
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

export function widgetFocusScope(widget: Widget): WidgetFocusScope | undefined {
  const scope = widget.focus?.scope ?? (widget.kind === 'modal' ? 'contain' : undefined);
  return scope === 'none' ? undefined : scope;
}

export function widgetCursor(
  widget: Widget,
  target: WidgetLayoutTarget<unknown>,
  theme: TerminalTheme
): { readonly row: number; readonly column: number } | undefined {
  return target.cursor
    ?? widgetFocusTargets(widget, target.bounds, theme).find((item) => sameRect(item.bounds, target.bounds))?.cursor;
}

export function widgetHitTargets<TMessage>(
  widget: Widget<TMessage>,
  target: WidgetLayoutTarget<TMessage>,
  theme: TerminalTheme
): readonly HitTarget<TMessage>[] {
  return widgetRenderer(widget).hitTargets?.({ widget, bounds: target.bounds, theme }) ?? [];
}

function customRenderer<TMessage>(widget: Widget<TMessage>): WidgetRenderer<TMessage> {
  const renderer = widget.custom?.renderer;
  if (renderer === undefined) {
    throw new Error('Custom widgets must provide a renderer.');
  }
  return renderer;
}
