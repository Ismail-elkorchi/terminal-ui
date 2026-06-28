import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import { collectLayoutFocusTargets, collectWidgetLayoutTargets, findWidgetFocusTarget, focusPathIncludes, resolveFocusPath } from './focus.ts';
import { createFrameBuffer } from './frame.ts';
import { layoutWidget } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { renderWidgetRenderer, widgetCursor, widgetHitTargets } from './widget-behavior.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath, LayoutFocusTarget } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { Layer, LayoutNode, Rect } from './layout.ts';

export {
  clipRenderSpans,
  createFrameBuffer,
  diffFrames,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle
} from './frame.ts';
export type {
  CursorPosition,
  AnsiStyleState,
  Frame,
  FrameBuffer,
  FrameCell,
  FrameCellSource,
  FocusPath,
  FrameRowDiff,
  RenderBlock,
  RenderDiff,
  RenderLine,
  RenderOperation,
  RenderSerializeOptions,
  RenderSpan,
  TerminalColor,
  TerminalLink,
  TerminalStyle
} from './frame.ts';

export interface RenderWidgetFrameOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
}

export interface RenderLayer {
  readonly id: string;
  readonly zIndex: number;
  readonly bounds: Rect;
  readonly cells: readonly FrameCell[];
  readonly hitTargets: readonly FrameHitTarget[];
  readonly focusTargets: readonly LayoutFocusTarget[];
}

export function renderWidgetFrame(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): Frame {
  const theme = themeForOptions(options.theme);
  const layout = layoutWidget(widget, viewport, theme);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const layers = renderLayoutLayers(widget, layout, viewport, theme, resolvedFocusPath);
  const buffer = compositeLayers(viewport, layers);
  const cursor = cursorForFocusedWidget(widget, layout, resolvedFocusPath, theme);
  const hitTargets = layers.flatMap((layer) => layer.hitTargets);
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(widget, layout, [], resolvedFocusPath, theme),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return buffer.snapshot({
    accessibility,
    ...(hitTargets.length === 0 ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
}

export function renderWidgetLayers(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): readonly RenderLayer[] {
  const theme = themeForOptions(options.theme);
  const layout = layoutWidget(widget, viewport, theme);
  return renderLayoutLayers(widget, layout, viewport, theme, resolveFocusPath(layout, options.focusPath));
}

function renderLayoutLayers(
  widget: Widget,
  layout: LayoutNode,
  viewport: TerminalViewport,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): readonly RenderLayer[] {
  const composer = createLayerComposer(viewport);
  renderWidgetToLayer(widget, layout, [], composer.layerFor(layout.layer), composer, theme, focusPath);
  return composer.snapshot(widget, layout, theme);
}

function frameHitTargets(widget: Widget, layout: LayoutNode, theme: TerminalTheme, zIndex: number): readonly FrameHitTarget[] {
  return collectWidgetLayoutTargets(widget, layout).filter((target) => target.layer.zIndex === zIndex).flatMap((target): FrameHitTarget[] =>
    widgetHitTargets(target.widget, target, theme).map((hitTarget) => ({
      id: hitTarget.id,
      bounds: hitTarget.bounds,
      ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
      zIndex: hitTarget.zIndex ?? zIndex
    }))
  );
}

function renderWidgetToLayer(
  widget: Widget,
  node: LayoutNode,
  parentPath: FocusPath,
  layer: MutableRenderLayer,
  composer: LayerComposer,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderWidgetRenderer(widget, {
    node,
    buffer: layer.buffer,
    theme,
    focused: focusPathIncludes(focusPath, path),
    renderChildren(target = layer.buffer) {
      renderWidgetChildrenToLayers(widget, node, path, target, layer, composer, theme, focusPath);
    }
  });
}

function renderWidgetChildrenToLayers(
  widget: Widget,
  node: LayoutNode,
  path: FocusPath,
  buffer: FrameBuffer,
  layer: MutableRenderLayer,
  composer: LayerComposer,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  const children = widget.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (buffer !== layer.buffer) {
      renderWidgetToBuffer(child, childNode, path, buffer, theme, focusPath);
      continue;
    }
    const childLayer = childNode.layer.zIndex === layer.zIndex ? layer : composer.layerFor(childNode.layer);
    renderWidgetToLayer(child, childNode, path, childLayer, composer, theme, focusPath);
  }
}

function renderWidgetToBuffer(
  widget: Widget,
  node: LayoutNode,
  parentPath: FocusPath,
  buffer: FrameBuffer,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderWidgetRenderer(widget, {
    node,
    buffer,
    theme,
    focused: focusPathIncludes(focusPath, path),
    renderChildren(target = buffer) {
      for (const { child, childNode } of orderedChildren(widget.children ?? [], node)) {
        renderWidgetToBuffer(child, childNode, path, target, theme, focusPath);
      }
    }
  });
}

function nodePath(node: LayoutNode, parentPath: FocusPath): FocusPath {
  return [...parentPath, node.id ?? `${node.kind}:${String(node.bounds.row)}:${String(node.bounds.column)}`];
}

function orderedChildren(
  children: readonly Widget[],
  node: LayoutNode
): readonly { readonly child: Widget; readonly childNode: LayoutNode; readonly index: number }[] {
  return children
    .map((child, index) => ({ child, childNode: node.children[index], index }))
    .filter((item): item is { readonly child: Widget; readonly childNode: LayoutNode; readonly index: number } =>
      item.childNode !== undefined
    )
    .sort((left, right) => left.childNode.layer.zIndex - right.childNode.layer.zIndex || left.index - right.index);
}

interface MutableRenderLayer {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  bounds: Rect;
  readonly buffer: FrameBuffer;
}

interface LayerComposer {
  layerFor(layer: Layer): MutableRenderLayer;
  snapshot(widget: Widget, layout: LayoutNode, theme: TerminalTheme): readonly RenderLayer[];
}

function createLayerComposer(viewport: TerminalViewport): LayerComposer {
  const layers: MutableRenderLayer[] = [];
  return {
    layerFor(layer) {
      const existing = layers.find((item) => item.zIndex === layer.zIndex);
      if (existing !== undefined) {
        existing.bounds = unionRects(existing.bounds, layer.bounds);
        return existing;
      }
      const next: MutableRenderLayer = {
        id: `z:${String(layer.zIndex)}`,
        zIndex: layer.zIndex,
        order: layers.length,
        bounds: layer.bounds,
        buffer: createFrameBuffer(viewport.columns, viewport.rows)
      };
      layers.push(next);
      return next;
    },
    snapshot(widget, layout, theme) {
      return layers
        .toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)
        .map((layer): RenderLayer => ({
          id: layer.id,
          zIndex: layer.zIndex,
          bounds: layer.bounds,
          cells: layer.buffer.snapshot().cells,
          hitTargets: frameHitTargets(widget, layout, theme, layer.zIndex),
          focusTargets: collectLayoutFocusTargets(layout).filter((target) => target.layer.zIndex === layer.zIndex)
        }));
    }
  };
}

function compositeLayers(viewport: TerminalViewport, layers: readonly RenderLayer[]): FrameBuffer {
  const buffer = createFrameBuffer(viewport.columns, viewport.rows);
  for (const layer of layers) {
    for (const cell of layer.cells) buffer.writeCell(cell);
  }
  return buffer;
}

function unionRects(left: Rect, right: Rect): Rect {
  const row = Math.min(left.row, right.row);
  const column = Math.min(left.column, right.column);
  const bottom = Math.max(left.row + left.height, right.row + right.height);
  const rightEdge = Math.max(left.column + left.width, right.column + right.width);
  return { row, column, width: Math.max(0, rightEdge - column), height: Math.max(0, bottom - row) };
}

function themeForOptions(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defineTheme();
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function cursorForFocusedWidget(
  widget: Widget,
  layout: LayoutNode,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme
): { readonly row: number; readonly column: number } | undefined {
  const target = findWidgetFocusTarget(widget, layout, focusPath);
  if (target === undefined) return undefined;
  return widgetCursor(target.widget, target, theme) ?? { row: target.bounds.row, column: target.bounds.column };
}
