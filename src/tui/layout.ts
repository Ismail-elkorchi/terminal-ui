import type { TerminalViewport } from '../host/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { Widget, WidgetFocusScope, WidgetKind } from '../widgets/index.ts';
import { layoutChildBounds, widgetFocusScope, widgetFocusTargets } from './widget-behavior.ts';

export interface Rect {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
}

export interface Layer {
  readonly id: string;
  readonly zIndex: number;
  readonly bounds: Rect;
}

export interface LayoutNode {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly bounds: Rect;
  readonly layer: Layer;
  readonly visible: boolean;
  readonly focusable: boolean;
  readonly focusScope?: WidgetFocusScope;
  readonly focusTargets: readonly LayoutFocusRegion[];
  readonly children: readonly LayoutNode[];
}

export interface LayoutFocusRegion {
  readonly id?: string;
  readonly bounds: Rect;
  readonly cursor?: {
    readonly row: number;
    readonly column: number;
  };
  readonly disabled: boolean;
  readonly order?: number;
}

export function layoutWidget(
  widget: Widget,
  viewport: TerminalViewport | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition
): LayoutNode {
  const theme = themeForLayout(themeInput);
  const bounds = 'columns' in viewport
    ? { row: 1, column: 1, width: viewport.columns, height: viewport.rows }
    : viewport;
  return layoutNode(widget, clampRect(bounds), theme, 0, 0);
}

function layoutNode(widget: Widget, bounds: Rect, theme: TerminalTheme, ordinal: number, parentZIndex: number): LayoutNode {
  const visible = widget.layer?.visible !== false;
  const zIndex = parentZIndex + zIndexForWidget(widget);
  const layer = { id: layerId(widget, bounds, ordinal), zIndex, bounds };
  if (!visible) {
    return {
      ...(widget.id === undefined ? {} : { id: widget.id }),
      kind: widget.kind,
      bounds,
      layer,
      visible: false,
      focusable: false,
      focusTargets: [],
      children: []
    };
  }
  const childBounds = boundsForChildren(widget, bounds, theme);
  const focusTargets = widgetFocusTargets(widget, bounds, theme).map((target): LayoutFocusRegion => ({
    ...(target.id === undefined ? {} : { id: target.id }),
    bounds: target.bounds,
    ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
    disabled: target.disabled === true,
    ...(target.order === undefined ? {} : { order: target.order })
  }));
  const focusScope = widgetFocusScope(widget);
  return {
    ...(widget.id === undefined ? {} : { id: widget.id }),
    kind: widget.kind,
    bounds,
    layer,
    visible,
    focusable: focusTargets.some((target) => !target.disabled && target.bounds.width > 0 && target.bounds.height > 0),
    ...(focusScope === undefined ? {} : { focusScope }),
    focusTargets,
    children: (widget.children ?? [])
      .map((child, index) => layoutNode(child, childBounds[index] ?? emptyRect(bounds), theme, index, zIndex))
  };
}

function boundsForChildren(widget: Widget, bounds: Rect, theme: TerminalTheme): readonly Rect[] {
  const children = widget.children ?? [];
  return children.length === 0 ? [] : layoutChildBounds(widget, bounds, theme);
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

function zIndexForWidget(widget: Widget): number {
  const zIndex = widget.layer?.zIndex;
  return zIndex === undefined || !Number.isFinite(zIndex) ? 0 : zIndex;
}

function layerId(widget: Widget, bounds: Rect, ordinal: number): string {
  return widget.id ?? `${widget.kind}:${String(bounds.row)}:${String(bounds.column)}:${String(ordinal)}`;
}

function themeForLayout(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defineTheme();
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}
