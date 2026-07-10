import type { TerminalViewport } from '../host/index.ts';
import type { RenderNode, RenderNodeFocusScope, RenderNodeKind } from '../render-node/index.ts';
import type { Element } from '../components/element.ts';
import { toRenderNode } from '../render-node/element.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { CursorPosition } from './cursor.ts';
import { layoutChildBounds, focusScopeForRenderNode, focusTargetsForRenderNode } from './render-node-behavior.ts';

export interface Rect {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
}

export type RegionOpacity = 'opaque' | 'transparent' | 'inheritBackground';

export interface Layer {
  readonly id: string;
  readonly zIndex: number;
  readonly bounds: Rect;
  readonly opacity: RegionOpacity;
}

export interface LayoutNode {
  readonly id?: string;
  readonly identity: string;
  readonly kind: RenderNodeKind;
  readonly bounds: Rect;
  readonly layer: Layer;
  readonly visible: boolean;
  readonly focusable: boolean;
  readonly focusScope?: RenderNodeFocusScope;
  readonly focusTargets: readonly LayoutFocusRegion[];
  readonly children: readonly LayoutNode[];
}

export interface LayoutFocusRegion {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: CursorPosition;
  readonly disabled: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export function layoutElement(
  element: Element,
  viewport: TerminalViewport | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition
): LayoutNode {
  return layoutRenderNode(toRenderNode(element), viewport, themeInput);
}

export function layoutRenderNode(
  widget: RenderNode,
  viewport: TerminalViewport | Rect,
  themeInput?: TerminalTheme | TerminalThemeDefinition
): LayoutNode {
  const theme = themeForLayout(themeInput);
  const bounds = 'columns' in viewport
    ? { row: 1, column: 1, width: viewport.columns, height: viewport.rows }
    : viewport;
  return layoutNode(widget, clampRect(bounds), theme, 0, 0, []);
}

function layoutNode(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  ordinal: number,
  parentZIndex: number,
  parentIdentity: readonly string[]
): LayoutNode {
  const visible = widget.layer?.visible !== false;
  const zIndex = parentZIndex + zIndexForRenderNode(widget);
  const identity = widget.id ?? `${widget.kind}:${String(ordinal)}`;
  const identityPath = [...parentIdentity, identity];
  const layer = {
    id: identityPath.join('/'),
    zIndex,
    bounds,
    opacity: opacityForRenderNode(widget)
  };
  if (!visible) {
    return {
      ...(widget.id === undefined ? {} : { id: widget.id }),
      identity,
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
  const focusTargets = focusTargetsForRenderNode(widget, bounds, theme).map((target): LayoutFocusRegion => ({
    id: target.id,
    bounds: target.bounds,
    ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
    disabled: target.disabled === true,
    ...(target.order === undefined ? {} : { order: target.order }),
    ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
  }));
  const focusScope = focusScopeForRenderNode(widget);
  return {
    ...(widget.id === undefined ? {} : { id: widget.id }),
    identity,
    kind: widget.kind,
    bounds,
    layer,
    visible,
    focusable: focusTargets.some((target) => !target.disabled && target.bounds.width > 0 && target.bounds.height > 0),
    ...(focusScope === undefined ? {} : { focusScope }),
    focusTargets,
    children: (widget.children ?? [])
      .map((child, index) => layoutNode(
        child,
        childBounds[index] ?? emptyRect(bounds),
        theme,
        index,
        zIndex,
        identityPath
      ))
  };
}

function boundsForChildren(widget: RenderNode, bounds: Rect, theme: TerminalTheme): readonly Rect[] {
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

function zIndexForRenderNode(widget: RenderNode): number {
  const zIndex = widget.layer?.zIndex;
  return zIndex === undefined || !Number.isFinite(zIndex) ? 0 : zIndex;
}

function opacityForRenderNode(widget: RenderNode): RegionOpacity {
  return widget.layer?.opacity ?? 'transparent';
}

function themeForLayout(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defineTheme();
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}
