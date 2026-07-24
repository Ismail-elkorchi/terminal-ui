import { toAccessibleSnapshot } from '../../accessibility/index.ts';
import type { Element } from '../../element/index.ts';
import { toRenderNode } from '../model/element.ts';
import type { RenderNode } from '../model/index.ts';
import { createRenderEnvironment } from './render-environment.ts';
import { findRenderNodeFocusTarget, focusPathForLayoutTarget, renderFocusRelation, resolveFocusPath } from './focus.ts';
import { createRegionTargetIndex } from './region-target-index.ts';
import type { RegionTargetIndex } from './region-target-index.ts';
import { createFrameBuffer } from './frame.ts';
import { blitFrameCell } from './frame-buffer.ts';
import { applyCursorStyle } from './cursor-style.ts';
import { applyFramePasses, boxDrawingJoinPass } from './frame-passes/index.ts';
import { layoutRenderNode } from './layout.ts';
import { accessibleNode } from './render-accessibility.ts';
import { createDraftRenderRegion, regionIdForLayoutNode, toRegionHitTarget } from './render-regions.ts';
import { renderRenderNode, cursorForRenderNode, hitTargetsForRenderNode } from './render-node-behavior.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';
import type { RenderTarget } from '../model/render-target.ts';
import type { RenderWorkInstrumentation, RenderWorkMeasurement } from '../model/instrumentation.ts';

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
  RenderDiffAnsiOptions,
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
  readonly widthProfile?: TextWidthProfile;
  readonly framePasses?: readonly FramePass[];
  readonly disableFramePasses?: boolean;
  readonly instrumentation?: RenderInstrumentation;
}

export type RenderStage =
  | 'resolve_element'
  | 'layout'
  | 'focus'
  | 'regions'
  | 'composition'
  | 'frame_passes'
  | 'cursor'
  | 'hit_targets'
  | 'accessibility'
  | 'snapshot';

export interface RenderStageMeasurement {
  readonly stage: RenderStage;
  readonly durationMs: number;
}

export interface RenderInstrumentation {
  readonly now: () => number;
  record(measurement: RenderStageMeasurement): void;
  readonly recordWork?: RenderWorkInstrumentation['recordWork'];
}

export type { RenderWorkInstrumentation, RenderWorkKind, RenderWorkMeasurement } from '../model/instrumentation.ts';

export interface InternalRenderResult<TMessage = unknown> {
  readonly node: RenderNode<TMessage>;
  readonly terminalSize: TerminalSize;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly frame: Frame;
}

export function renderElementFrame(
  element: Element<unknown>,
  terminalSize: TerminalSize,
  options: RenderElementOptions = {}
): Frame {
  return renderElementInternal(element, terminalSize, options).frame;
}

export function renderElementInternal<TMessage>(
  element: Element<TMessage>,
  terminalSize: TerminalSize,
  options: RenderElementOptions = {}
): InternalRenderResult<TMessage> {
  const renderNode = measureRenderStage(options.instrumentation, 'resolve_element', () => toRenderNode(element));
  recordRenderWork(options.instrumentation, { kind: 'authored_nodes', count: renderNodeCount(renderNode) });
  const environment = createRenderEnvironment({
    terminalSize,
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.widthProfile === undefined ? {} : { widthProfile: options.widthProfile })
  });
  const { theme, widthProfile } = environment;
  const layout = measureRenderStage(options.instrumentation, 'layout', () =>
    layoutRenderNode(renderNode, terminalSize, theme, widthProfile)
  );
  recordRenderWork(options.instrumentation, { kind: 'measured_nodes', count: layoutNodeCount(layout) });
  recordRenderWork(options.instrumentation, { kind: 'rendered_nodes', count: visibleLayoutNodeCount(layout) });
  const resolvedFocusPath = measureRenderStage(options.instrumentation, 'focus', () =>
    resolveFocusPath(layout, options.focusPath)
  );
  const regions = measureRenderStage(options.instrumentation, 'regions', () =>
    renderLayoutRegions(renderNode, layout, terminalSize, theme, widthProfile, resolvedFocusPath)
  );
  recordRenderWork(options.instrumentation, {
    kind: 'hit_target_candidates',
    count: regions.reduce((total, region) => total + region.hitTargets.length, 0)
  });
  const buffer = measureRenderStage(options.instrumentation, 'composition', () =>
    compositeRegions(terminalSize, regions, widthProfile)
  );
  recordRenderWork(options.instrumentation, {
    kind: 'composed_cells',
    count: regions.reduce((total, region) => total + region.cells.length, 0)
  });
  measureRenderStage(options.instrumentation, 'frame_passes', () => {
    applyFramePasses(buffer, framePassesForOptions(options), { theme, terminalSize, widthProfile });
  });
  const cursor = measureRenderStage(options.instrumentation, 'cursor', () => {
    const next = cursorForFocusedRenderNode(renderNode, layout, resolvedFocusPath, theme, widthProfile);
    applyCursorStyle(buffer, next);
    return next;
  });
  const hitTargets = measureRenderStage(options.instrumentation, 'hit_targets', () =>
    regions.flatMap((region) => region.hitTargets.map(frameHitTargetFromRegion))
  );
  const accessibility = measureRenderStage(options.instrumentation, 'accessibility', () => toAccessibleSnapshot({
    source: 'renderer',
    root: accessibleNode(renderNode, layout, [], resolvedFocusPath, theme, widthProfile),
    ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
  }));
  const frame = measureRenderStage(options.instrumentation, 'snapshot', () => buffer.snapshot({
      accessibility,
      ...(hitTargets.length === 0 ? {} : { hitTargets }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
    }));
  recordRenderWork(options.instrumentation, { kind: 'snapshot_rows', count: frame.height });
  recordRenderWork(options.instrumentation, { kind: 'snapshot_cells', count: frame.width * frame.height });
  recordRenderWork(options.instrumentation, { kind: 'emitted_cells', count: frame.cells.length });
  return { node: renderNode, terminalSize: environment.terminalSize, theme, widthProfile, layout, regions, frame };
}

function recordRenderWork(
  instrumentation: RenderInstrumentation | undefined,
  measurement: RenderWorkMeasurement
): void {
  instrumentation?.recordWork?.(measurement);
}

function renderNodeCount(node: RenderNode): number {
  return 1 + (node.children ?? []).reduce((total, child) => total + renderNodeCount(child), 0);
}

function layoutNodeCount(node: LayoutNode): number {
  return 1 + node.children.reduce((total, child) => total + layoutNodeCount(child), 0);
}

function visibleLayoutNodeCount(node: LayoutNode): number {
  if (!node.visible) return 0;
  return 1 + node.children.reduce((total, child) => total + visibleLayoutNodeCount(child), 0);
}

function measureRenderStage<TValue>(
  instrumentation: RenderInstrumentation | undefined,
  stage: RenderStage,
  operation: () => TValue
): TValue {
  if (instrumentation === undefined) return operation();
  const now = instrumentation.now;
  const started = now();
  try {
    return operation();
  } finally {
    instrumentation.record({ stage, durationMs: Math.max(0, now() - started) });
  }
}

function framePassesForOptions(options: RenderElementOptions): readonly FramePass[] {
  if (options.disableFramePasses === true) return [];
  return options.framePasses ?? defaultFramePasses;
}

const defaultFramePasses: readonly FramePass[] = Object.freeze([boxDrawingJoinPass]);

export function renderElementRegions<TMessage>(
  element: Element<TMessage>,
  terminalSize: TerminalSize,
  options: RenderElementOptions = {}
): readonly RenderRegion<TMessage>[] {
  return renderElementInternal(element, terminalSize, options).regions;
}

function renderLayoutRegions<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  terminalSize: TerminalSize,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined
): readonly RenderRegion<TMessage>[] {
  const composer = createRegionComposer<TMessage>(terminalSize, widthProfile);
  const path = nodePath(layout, []);
  renderRenderNodeToRegion(renderNode, layout, [], composer.regionFor(layout, path), composer, theme, widthProfile, focusPath);
  return composer.snapshot(createRegionTargetIndex(renderNode, layout), theme, widthProfile);
}

function frameHitTargets<TMessage>(
  targets: readonly import('./focus.ts').RenderNodeLayoutTarget<TMessage>[],
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  region: DraftRenderRegion
): readonly RenderRegionHitTarget<TMessage>[] {
  return targets
    .flatMap((target): RenderRegionHitTarget<TMessage>[] =>
      hitTargetsForRenderNode(target.renderNode, target, theme, widthProfile).map((hitTarget) =>
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
  renderNode: RenderNode<TMessage>,
  node: LayoutNode,
  parentPath: FocusPath,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderRenderNode(renderNode, {
    layoutNode: node,
    buffer: region.buffer,
    theme,
    widthProfile,
    focus: renderFocusRelation(focusPath, path),
    renderChildren(target = region.buffer) {
      renderRenderNodeChildrenToRegions(renderNode, node, path, target, region, composer, theme, widthProfile, focusPath);
    }
  });
}

function renderRenderNodeChildrenToRegions<TMessage>(
  renderNode: RenderNode<TMessage>,
  node: LayoutNode,
  path: FocusPath,
  buffer: RenderTarget,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined
): void {
  const children = renderNode.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (buffer !== region.buffer) {
      renderRenderNodeToBuffer(child, childNode, path, buffer, theme, widthProfile, focusPath);
      continue;
    }
    const childRegion = childNode.layer.zIndex === region.zIndex
      ? region
      : composer.regionFor(childNode, [...path, childNode.identity]);
    renderRenderNodeToRegion(child, childNode, path, childRegion, composer, theme, widthProfile, focusPath);
  }
}

function renderRenderNodeToBuffer<TMessage>(
  renderNode: RenderNode<TMessage>,
  node: LayoutNode,
  parentPath: FocusPath,
  buffer: RenderTarget,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  renderRenderNode(renderNode, {
    layoutNode: node,
    buffer,
    theme,
    widthProfile,
    focus: renderFocusRelation(focusPath, path),
    renderChildren(target = buffer) {
      for (const { child, childNode } of orderedChildren(renderNode.children ?? [], node)) {
        renderRenderNodeToBuffer(child, childNode, path, target, theme, widthProfile, focusPath);
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
  snapshot(
    index: RegionTargetIndex<TMessage>,
    theme: TerminalTheme,
    widthProfile: TextWidthProfile
  ): readonly RenderRegion<TMessage>[];
}

function createRegionComposer<TMessage>(terminalSize: TerminalSize, widthProfile: TextWidthProfile): RegionComposer<TMessage> {
  const regions: DraftRenderRegion[] = [];
  let regionOrder = 0;
  return {
    regionFor(node, path) {
      const region = createDraftRenderRegion({
        id: regionIdForLayoutNode(node, path),
        zIndex: node.layer.zIndex,
        order: regionOrder,
        terminalSize,
        bounds: node.layer.bounds,
        underlay: node.layer.underlay,
        widthProfile
      });
      regionOrder += 1;
      regions.push(region);
      return region;
    },
    snapshot(index, theme, snapshotWidthProfile) {
      return regions
        .toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)
        .map((region): RenderRegion<TMessage> => {
          const snapshot = region.buffer.snapshot();
          return {
            id: region.id,
            zIndex: region.zIndex,
            order: region.order,
            bounds: region.bounds,
            underlay: region.underlay,
            cells: snapshot.cells,
            metadata: snapshot.metadata,
            hitTargets: frameHitTargets(
              index.layoutTargetsForRegion(region.zIndex, region.bounds),
              theme,
              snapshotWidthProfile,
              region
            ),
            focusTargets: index.focusTargetsForRegion(region.zIndex, region.bounds)
          };
        });
    }
  };
}

export function compositeRegions(
  terminalSize: TerminalSize,
  regions: readonly RenderRegion[],
  widthProfile: TextWidthProfile
): FrameBuffer {
  const buffer = createFrameBuffer(terminalSize.columns, terminalSize.rows, { widthProfile });
  for (const region of regions.toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)) {
    if (region.underlay === 'clear') {
      buffer.clear(region.bounds);
      for (const cell of region.cells) blitFrameCell(buffer, cell);
      continue;
    }
    if (region.underlay === 'inheritBackground') {
      for (const cell of region.cells) {
        blitFrameCell(buffer, withInheritedBackground(cell, buffer.readCell(cell.row, cell.column)));
      }
      continue;
    }
    for (const cell of region.cells) blitFrameCell(buffer, cell);
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

function cursorForFocusedRenderNode(
  renderNode: RenderNode,
  layout: LayoutNode,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): { readonly row: number; readonly column: number } | undefined {
  const target = findRenderNodeFocusTarget(renderNode, layout, focusPath);
  if (target === undefined) return undefined;
  return cursorForRenderNode(target.renderNode, target, theme, widthProfile)
    ?? { row: target.bounds.row, column: target.bounds.column };
}
