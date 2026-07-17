import { toAccessibleSnapshot } from '../../accessibility/index.ts';
import type { Element } from '../../element/index.ts';
import { toRenderNode } from '../model/element.ts';
import type { RenderNode } from '../model/index.ts';
import { defineTheme, isTerminalTheme } from '../../theme/index.ts';
import { findRenderNodeFocusTarget, focusPathForLayoutTarget, renderFocusRelation, resolveFocusPath } from './focus.ts';
import { createProjectionTargetIndex } from './projection-target-index.ts';
import type { ProjectionTargetIndex } from './projection-target-index.ts';
import { createFrameBuffer } from './frame.ts';
import { projectStyledCursor } from './cursor-projection.ts';
import { applyFramePasses, boxDrawingJoinPass } from './frame-passes/index.ts';
import { layoutRenderNode } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { createDraftRenderRegion, regionIdForLayoutNode, toRegionHitTarget } from './render-regions.ts';
import { renderRenderNode, cursorForRenderNode, hitTargetsForRenderNode } from './render-node-behavior.ts';
import type { ViewportSize } from '../../geometry/types.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';
import type { RenderTarget } from '../model/render-target.ts';

export {
  alignRenderLine,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  createFrameBuffer,
  diffFrames,
  frameCellSource,
  frameSourcePart,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFrameDebug,
  renderFramePlain,
  sameFrameCell,
  sameFrameCellSource,
  serializeRenderSpansStateful,
  sameTerminalColor,
  sameTerminalLink,
  sameTerminalStyle,
  sanitizeFrameCellSource,
  renderNodeFrameSource,
  wrapRenderSpans
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
  PadRenderLineOptions,
  RenderAlignment,
  RenderBlock,
  RenderBlockSize,
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

export interface RenderElementOptions {
  readonly focusPath?: FocusPath;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly framePasses?: readonly FramePass[];
  readonly disableFramePasses?: boolean;
}

export interface RenderElementProjection<TMessage = unknown> {
  readonly node: RenderNode<TMessage>;
  readonly viewport: ViewportSize;
  readonly theme: TerminalTheme;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly frame: Frame;
}

export function renderElementFrame(
  element: Element<unknown>,
  viewport: ViewportSize,
  options: RenderElementOptions = {}
): Frame {
  return renderElementProjection(element, viewport, options).frame;
}

export function renderElementProjection<TMessage>(
  element: Element<TMessage>,
  viewport: ViewportSize,
  options: RenderElementOptions = {}
): RenderElementProjection<TMessage> {
  const renderNode = toRenderNode(element);
  const theme = themeForOptions(options.theme);
  const layout = layoutRenderNode(renderNode, viewport, theme);
  const resolvedFocusPath = resolveFocusPath(layout, options.focusPath);
  const regions = renderLayoutRegions(renderNode, layout, viewport, theme, resolvedFocusPath);
  const buffer = compositeRegions(viewport, regions);
  applyFramePasses(buffer, framePassesForOptions(options), { theme, viewport });
  const cursor = cursorForFocusedRenderNode(renderNode, layout, resolvedFocusPath, theme);
  projectStyledCursor(buffer, cursor);
  const hitTargets = regions.flatMap((region) => region.hitTargets.map(frameHitTargetFromRegion));
  const accessibility = toAccessibleSnapshot({
    source: 'tui',
    root: accessibleNode(renderNode, layout, [], resolvedFocusPath, theme),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  const frame = buffer.snapshot({
    accessibility,
    ...(hitTargets.length === 0 ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  });
  return { node: renderNode, viewport, theme, layout, regions, frame };
}

function framePassesForOptions(options: RenderElementOptions): readonly FramePass[] {
  if (options.disableFramePasses === true) return [];
  return options.framePasses ?? defaultFramePasses;
}

const defaultFramePasses: readonly FramePass[] = Object.freeze([boxDrawingJoinPass]);

export function renderElementRegions(
  element: Element,
  viewport: ViewportSize,
  options: RenderElementOptions = {}
): readonly RenderRegion[] {
  return renderElementProjection(element, viewport, options).regions;
}

function renderLayoutRegions<TMessage>(
  widget: RenderNode<TMessage>,
  layout: LayoutNode,
  viewport: ViewportSize,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): readonly RenderRegion<TMessage>[] {
  const composer = createRegionComposer<TMessage>(viewport);
  const path = nodePath(layout, []);
  renderRenderNodeToRegion(widget, layout, [], composer.regionFor(layout, path), composer, theme, focusPath);
  return composer.snapshot(createProjectionTargetIndex(widget, layout), theme);
}

function frameHitTargets<TMessage>(
  targets: readonly import('./focus.ts').RenderNodeLayoutTarget<TMessage>[],
  theme: TerminalTheme,
  region: DraftRenderRegion
): readonly RenderRegionHitTarget<TMessage>[] {
  return targets
    .flatMap((target): RenderRegionHitTarget<TMessage>[] =>
      hitTargetsForRenderNode(target.renderNode, target, theme).map((hitTarget) =>
        toRegionHitTarget(hitTarget, region, resolveHitTargetFocus(hitTarget, target))
      )
    );
}

function resolveHitTargetFocus<TMessage>(
  hitTarget: import('../model/renderer.ts').HitTarget<TMessage>,
  target: import('./focus.ts').RenderNodeLayoutTarget<TMessage>
): import('../../interaction/focus.ts').ResolvedPointerFocusIntent | undefined {
  if (hitTarget.focus === undefined) return undefined;
  if (hitTarget.focus.kind === 'preserve') return hitTarget.focus;
  const path = focusPathForLayoutTarget(target, hitTarget.focus.targetId);
  if (path !== undefined) return { kind: 'focus', path };
  throw new Error(
    `Hit target "${hitTarget.id}" refers to unavailable focus target "${hitTarget.focus.targetId}".`
  );
}

function frameHitTargetFromRegion(hitTarget: RenderRegionHitTarget): FrameHitTarget {
  return {
    id: hitTarget.id,
    bounds: hitTarget.bounds,
    ...(hitTarget.accepts === undefined ? {} : { accepts: hitTarget.accepts }),
    ...(hitTarget.focus === undefined ? {} : { focus: hitTarget.focus }),
    ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
    ...(hitTarget.zIndex === undefined ? {} : { zIndex: hitTarget.zIndex })
  };
}

function renderRenderNodeToRegion<TMessage>(
  widget: RenderNode<TMessage>,
  node: LayoutNode,
  parentPath: FocusPath,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderRenderNode(widget, {
    layoutNode: node,
    buffer: region.buffer,
    theme,
    focus: renderFocusRelation(focusPath, path),
    renderChildren(target = region.buffer) {
      renderRenderNodeChildrenToRegions(widget, node, path, target, region, composer, theme, focusPath);
    }
  });
}

function renderRenderNodeChildrenToRegions<TMessage>(
  widget: RenderNode<TMessage>,
  node: LayoutNode,
  path: FocusPath,
  buffer: RenderTarget,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  const children = widget.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (buffer !== region.buffer) {
      renderRenderNodeToBuffer(child, childNode, path, buffer, theme, focusPath);
      continue;
    }
    const childRegion = childNode.layer.zIndex === region.zIndex
      ? region
      : composer.regionFor(childNode, [...path, childNode.identity]);
    renderRenderNodeToRegion(child, childNode, path, childRegion, composer, theme, focusPath);
  }
}

function renderRenderNodeToBuffer<TMessage>(
  widget: RenderNode<TMessage>,
  node: LayoutNode,
  parentPath: FocusPath,
  buffer: RenderTarget,
  theme: TerminalTheme,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderRenderNode(widget, {
    layoutNode: node,
    buffer,
    theme,
    focus: renderFocusRelation(focusPath, path),
    renderChildren(target = buffer) {
      for (const { child, childNode } of orderedChildren(widget.children ?? [], node)) {
        renderRenderNodeToBuffer(child, childNode, path, target, theme, focusPath);
      }
    }
  });
}

function nodePath(node: LayoutNode, parentPath: FocusPath): FocusPath {
  return [...parentPath, node.identity];
}

function orderedChildren(
  children: readonly RenderNode[],
  node: LayoutNode
): readonly { readonly child: RenderNode; readonly childNode: LayoutNode; readonly index: number }[] {
  return children
    .map((child, index) => ({ child, childNode: node.children[index], index }))
    .filter((item): item is { readonly child: RenderNode; readonly childNode: LayoutNode; readonly index: number } =>
      item.childNode !== undefined
    )
    .sort((left, right) => left.childNode.layer.zIndex - right.childNode.layer.zIndex || left.index - right.index);
}

interface RegionComposer<TMessage> {
  regionFor(node: LayoutNode, path: FocusPath): DraftRenderRegion;
  snapshot(index: ProjectionTargetIndex<TMessage>, theme: TerminalTheme): readonly RenderRegion<TMessage>[];
}

function createRegionComposer<TMessage>(viewport: ViewportSize): RegionComposer<TMessage> {
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
    snapshot(index, theme) {
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
            hitTargets: frameHitTargets(index.layoutTargetsForRegion(region.zIndex, region.bounds), theme, region),
            focusTargets: index.focusTargetsForRegion(region.zIndex, region.bounds)
          };
        });
    }
  };
}

export function compositeRegions(viewport: ViewportSize, regions: readonly RenderRegion[]): FrameBuffer {
  const buffer = createFrameBuffer(viewport.columns, viewport.rows);
  for (const region of regions.toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)) {
    if (region.opacity === 'opaque') {
      buffer.clear(region.bounds);
      for (const cell of region.cells) buffer.writeCell(cell);
      continue;
    }
    if (region.opacity === 'inheritBackground') {
      for (const cell of region.cells) {
        buffer.writeCell(withInheritedBackground(cell, buffer.readCell(cell.row, cell.column)));
      }
      continue;
    }
    for (const cell of region.cells) buffer.writeCell(cell);
  }
  return buffer;
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

function themeForOptions(theme: TerminalTheme | TerminalThemeDefinition | undefined): TerminalTheme {
  if (theme === undefined) return defineTheme();
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function cursorForFocusedRenderNode(
  widget: RenderNode,
  layout: LayoutNode,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme
): { readonly row: number; readonly column: number } | undefined {
  const target = findRenderNodeFocusTarget(widget, layout, focusPath);
  if (target === undefined) return undefined;
  return cursorForRenderNode(target.renderNode, target, theme) ?? { row: target.bounds.row, column: target.bounds.column };
}
