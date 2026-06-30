import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import { collectLayoutFocusTargets, collectWidgetLayoutTargets, findWidgetFocusTarget, focusPathIncludes, resolveFocusPath } from './focus.ts';
import { createFrameBuffer } from './frame.ts';
import { applyFramePasses, boxDrawingJoinPass } from './frame-passes/index.ts';
import { layoutWidget } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { createDraftRenderRegion, regionIdForLayoutNode, toRegionHitTarget } from './render-regions.ts';
import { renderWidgetRenderer, widgetCursor, widgetHitTargets } from './widget-behavior.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';

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
  DiffFramesOptions,
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
export type { RenderRegion, RenderRegionHitTarget } from './render-regions.ts';

export interface RenderWidgetFrameOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly framePasses?: readonly FramePass[];
  readonly disableFramePasses?: boolean;
}

export interface RenderWidgetFrameProjection<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly viewport: TerminalViewport;
  readonly theme: TerminalTheme;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly frame: Frame;
}

export function renderWidgetFrame(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): Frame {
  return renderWidgetFrameProjection(widget, viewport, options).frame;
}

export function renderWidgetFrameProjection<TMessage>(
  widget: Widget<TMessage>,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): RenderWidgetFrameProjection<TMessage> {
  const theme = themeForOptions(options.theme);
  const layout = layoutWidget(widget, viewport, theme);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const regions = renderLayoutRegions(widget, layout, viewport, theme, resolvedFocusPath);
  const buffer = compositeRegions(viewport, regions);
  applyFramePasses(buffer, framePassesForOptions(options), { theme, viewport });
  const cursor = cursorForFocusedWidget(widget, layout, resolvedFocusPath, theme);
  const hitTargets = regions.flatMap((region) => region.hitTargets.map(frameHitTargetFromRegion));
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(widget, layout, [], resolvedFocusPath, theme),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  const frame = buffer.snapshot({
    accessibility,
    ...(hitTargets.length === 0 ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return { widget, viewport, theme, layout, regions, frame };
}

function framePassesForOptions(options: RenderWidgetFrameOptions): readonly FramePass[] {
  if (options.disableFramePasses === true) return [];
  return options.framePasses ?? defaultFramePasses;
}

const defaultFramePasses: readonly FramePass[] = Object.freeze([boxDrawingJoinPass]);

export function renderWidgetRegions(
  widget: Widget,
  viewport: TerminalViewport,
  options: RenderWidgetFrameOptions = {}
): readonly RenderRegion[] {
  return renderWidgetFrameProjection(widget, viewport, options).regions;
}

function renderLayoutRegions<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  viewport: TerminalViewport,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): readonly RenderRegion<TMessage>[] {
  const composer = createRegionComposer<TMessage>(viewport);
  const path = nodePath(layout, []);
  renderWidgetToRegion(widget, layout, [], composer.regionFor(layout, path), composer, theme, focusPath);
  return composer.snapshot(widget, layout, theme);
}

function frameHitTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  theme: TerminalTheme,
  region: DraftRenderRegion
): readonly RenderRegionHitTarget<TMessage>[] {
  return collectWidgetLayoutTargets(widget, layout)
    .filter((target) => target.layer.zIndex === region.zIndex && rectsOverlap(target.bounds, region.bounds))
    .flatMap((target): RenderRegionHitTarget<TMessage>[] =>
      widgetHitTargets(target.widget, target, theme).map((hitTarget) => toRegionHitTarget(hitTarget, region))
    );
}

function frameHitTargetFromRegion(hitTarget: RenderRegionHitTarget): FrameHitTarget {
  return {
    id: hitTarget.id,
    bounds: hitTarget.bounds,
    ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
    ...(hitTarget.zIndex === undefined ? {} : { zIndex: hitTarget.zIndex })
  };
}

function renderWidgetToRegion<TMessage>(
  widget: Widget<TMessage>,
  node: LayoutNode,
  parentPath: FocusPath,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderWidgetRenderer(widget, {
    node,
    buffer: region.buffer,
    theme,
    focused: focusPathIncludes(focusPath, path),
    renderChildren(target = region.buffer) {
      renderWidgetChildrenToRegions(widget, node, path, target, region, composer, theme, focusPath);
    }
  });
}

function renderWidgetChildrenToRegions<TMessage>(
  widget: Widget<TMessage>,
  node: LayoutNode,
  path: FocusPath,
  buffer: FrameBuffer,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  const children = widget.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (buffer !== region.buffer) {
      renderWidgetToBuffer(child, childNode, path, buffer, theme, focusPath);
      continue;
    }
    const childRegion = childNode.layer.zIndex === region.zIndex ? region : composer.regionFor(childNode, [...path, childNode.id ?? childNode.layer.id]);
    renderWidgetToRegion(child, childNode, path, childRegion, composer, theme, focusPath);
  }
}

function renderWidgetToBuffer<TMessage>(
  widget: Widget<TMessage>,
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
  return [...parentPath, node.id ?? node.layer.id];
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

interface RegionComposer<TMessage> {
  regionFor(node: LayoutNode, path: FocusPath): DraftRenderRegion;
  snapshot(widget: Widget<TMessage>, layout: LayoutNode, theme: TerminalTheme): readonly RenderRegion<TMessage>[];
}

function createRegionComposer<TMessage>(viewport: TerminalViewport): RegionComposer<TMessage> {
  const regions: DraftRenderRegion[] = [];
  let regionOrder = 0;
  return {
    regionFor(node, path) {
      const region = createDraftRenderRegion({
        id: regionIdForLayoutNode(node, path),
        zIndex: node.layer.zIndex,
        order: regionOrder,
        viewport,
        bounds: node.layer.bounds,
        opacity: node.layer.opacity
      });
      regionOrder += 1;
      regions.push(region);
      return region;
    },
    snapshot(widget, layout, theme) {
      return regions
        .toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)
        .map((region): RenderRegion<TMessage> => {
          const snapshot = region.buffer.snapshot();
          return {
            id: region.id,
            zIndex: region.zIndex,
            order: region.order,
            bounds: region.bounds,
            opacity: region.opacity,
            cells: snapshot.cells,
            metadata: snapshot.metadata,
            hitTargets: frameHitTargets(widget, layout, theme, region),
            focusTargets: collectLayoutFocusTargets(layout).filter((target) =>
              target.layer.zIndex === region.zIndex && rectsOverlap(target.bounds, region.bounds)
            )
          };
        });
    }
  };
}

export function compositeRegions(viewport: TerminalViewport, regions: readonly RenderRegion[]): FrameBuffer {
  const buffer = createFrameBuffer(viewport.columns, viewport.rows);
  for (const region of regions.toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)) {
    if (region.opacity === 'opaque') {
      buffer.clear(region.bounds);
      for (const cell of region.cells) buffer.writeCell(cell);
      continue;
    }
    if (region.opacity === 'inheritBackground') {
      const lowerCells = indexedCells(buffer.snapshot().cells);
      for (const cell of region.cells) buffer.writeCell(withInheritedBackground(cell, lowerCells.get(cellKey(cell))));
      continue;
    }
    for (const cell of region.cells) buffer.writeCell(cell);
  }
  return buffer;
}

function indexedCells(cells: readonly FrameCell[]): ReadonlyMap<string, FrameCell> {
  return new Map(cells.map((cell) => [cellKey(cell), cell]));
}

function cellKey(cell: { readonly row: number; readonly column: number }): string {
  return `${String(cell.row)}:${String(cell.column)}`;
}

function withInheritedBackground(cell: FrameCell, lower: FrameCell | undefined): FrameCell {
  const background = lower?.style?.bg;
  if (background === undefined || cell.style?.bg !== undefined) return cell;
  return {
    ...cell,
    style: {
      ...cell.style,
      bg: background
    }
  };
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.row < right.row + right.height
    && left.row + left.height > right.row
    && left.column < right.column + right.width
    && left.column + left.width > right.column;
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
