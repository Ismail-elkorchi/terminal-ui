import { toAccessibleSnapshot } from '../../accessibility/index.ts';
import type { Element } from '../../element/index.ts';
import { toRenderNode } from '../model/element.ts';
import type { RenderNode } from '../model/index.ts';
import { createRenderEnvironment } from './render-environment.ts';
import {
  findRenderNodeFocusTarget,
  focusedTargetIdForLayoutNode,
  focusPathForLayoutTarget,
  layoutFocusPath,
  renderFocusRelation,
  resolveFocusPath
} from './focus.ts';
import { createRegionTargetIndex } from './region-target-index.ts';
import type { RegionTargetIndex } from './region-target-index.ts';
import { createFrameBuffer } from './frame.ts';
import { blitFrameCell } from './frame-buffer.ts';
import { applyCursorStyle } from './cursor-style.ts';
import { applyFramePasses, boxDrawingJoinPass } from './frame-passes/index.ts';
import { layoutRenderNode } from './layout.ts';
import {
  accessibleNode,
  inertAccessibleRoot,
  withControlLabelRelationships
} from './render-accessibility.ts';
import {
  createDraftRenderRegion,
  hitTargetOwnerIdentity,
  regionIdForLayoutNode,
  toRegionHitTarget
} from './render-regions.ts';
import { intersectRects } from './rect.ts';
import {
  hitTargetsForRenderNode,
  renderNodeClipsChildren,
  renderRenderNode
} from './render-node-behavior.ts';
import { assertValidRenderedAccessibility } from './component-output.ts';
import { renderNodeFactoryName } from '../model/node.ts';
import {
  createClippedRenderTarget,
  createLocalComponentRenderTarget
} from './scoped-render-target.ts';
import {
  assertDecorativeNodeHasNoHitTargets,
  decorativeSubtreeNodes
} from './decorative.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type {
  LayoutNode,
  Rect,
  RenderInstrumentation,
  RenderStage,
  RenderTarget,
  RenderWorkMeasurement
} from '../contracts.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';

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
  recordRenderWork(options.instrumentation, { kind: 'render_nodes', count: renderNodeCount(renderNode) });
  const environment = createRenderEnvironment({
    terminalSize,
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.widthProfile === undefined ? {} : { widthProfile: options.widthProfile })
  });
  const { theme, widthProfile } = environment;
  const layout = measureRenderStage(options.instrumentation, 'layout', () =>
    layoutRenderNode(renderNode, terminalSize, theme, widthProfile)
  );
  const decorativeNodes = decorativeSubtreeNodes(renderNode, layout);
  recordRenderWork(options.instrumentation, { kind: 'measured_nodes', count: layoutNodeCount(layout) });
  recordRenderWork(options.instrumentation, { kind: 'rendered_nodes', count: visibleLayoutNodeCount(layout) });
  const resolvedFocusPath = measureRenderStage(options.instrumentation, 'focus', () =>
    resolveFocusPath(layout, options.focusPath)
  );
  const regions = measureRenderStage(options.instrumentation, 'regions', () =>
    renderLayoutRegions(
      renderNode,
      layout,
      terminalSize,
      theme,
      widthProfile,
      resolvedFocusPath,
      decorativeNodes
    )
  );
  recordRenderWork(options.instrumentation, {
    kind: 'hit_target_candidates',
    count: regions.reduce((total, region) => total + region.hitTargets.length, 0)
  });
  const buffer = measureRenderStage(options.instrumentation, 'composition', () => {
    const composed = compositeRegions(terminalSize, regions, widthProfile);
    applyThemeCanvas(composed, theme);
    return composed;
  });
  recordRenderWork(options.instrumentation, {
    kind: 'composed_cells',
    count: regions.reduce((total, region) => total + region.cells.length, 0)
  });
  measureRenderStage(options.instrumentation, 'frame_passes', () => {
    applyFramePasses(buffer, framePassesForOptions(options), { theme, terminalSize, widthProfile });
  });
  const cursor = measureRenderStage(options.instrumentation, 'cursor', () => {
    const next = cursorForFocusedRenderNode(renderNode, layout, resolvedFocusPath);
    applyCursorStyle(buffer, next);
    return next;
  });
  const hitTargets = measureRenderStage(options.instrumentation, 'hit_targets', () =>
    regions.flatMap((region) => region.hitTargets.map(frameHitTargetFromRegion))
  );
  const accessibility = measureRenderStage(options.instrumentation, 'accessibility', () => {
    const accessibleRoot = accessibleNode(
      renderNode,
      layout,
      [],
      resolvedFocusPath,
      theme,
      widthProfile
    );
    const snapshot = toAccessibleSnapshot({
      source: 'renderer',
      root: accessibleRoot === undefined
        ? inertAccessibleRoot()
        : withControlLabelRelationships(accessibleRoot)
    });
    assertValidRenderedAccessibility(snapshot, resolvedFocusPath !== undefined);
    return snapshot;
  });
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
  focusPath: FocusPath | undefined,
  decorativeNodes: ReadonlySet<RenderNode>
): readonly RenderRegion<TMessage>[] {
  const composer = createRegionComposer<TMessage>(terminalSize, widthProfile, decorativeNodes);
  const path = nodePath(layout, []);
  renderRenderNodeToRegion(
    renderNode,
    layout,
    [],
    composer.regionFor(renderNode, layout, path),
    composer,
    theme,
    widthProfile,
    focusPath
  );
  return composer.snapshot(createRegionTargetIndex(renderNode, layout), theme, widthProfile);
}

function frameHitTargets<TMessage>(
  targets: readonly import('./focus.ts').RenderNodeLayoutTarget<TMessage>[],
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  region: DraftRenderRegion,
  decorativeNodes: ReadonlySet<RenderNode>
): readonly RenderRegionHitTarget<TMessage>[] {
  return targets
    .flatMap((target): RenderRegionHitTarget<TMessage>[] => {
      const hitTargets = hitTargetsForRenderNode(target.renderNode, target, theme, widthProfile);
      assertDecorativeNodeHasNoHitTargets(target.renderNode, hitTargets, decorativeNodes);
      return hitTargets.flatMap((hitTarget) => {
        const elementBounds = target.renderNode.kind === 'component'
          ? intersectRects(hitTarget.bounds, target.layoutNode.bounds)
          : hitTarget.bounds;
        const bounds = elementBounds === undefined
          ? undefined
          : intersectRects(elementBounds, target.layoutNode.viewport);
        return bounds === undefined
          ? []
          : [toRegionHitTarget(
              { ...hitTarget, bounds },
              region,
              hitTargetOwnerIdentity(target.path, target.layoutNode.identity),
              resolveHitTargetFocus(hitTarget, target)
            )];
      });
    });
}

function resolveHitTargetFocus<TMessage>(
  hitTarget: import('../contracts.ts').HitTarget<TMessage>,
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
  focusPath: FocusPath | undefined,
  target: RenderTarget = region.buffer
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  const renderTarget = targetForRenderNode(renderNode, node, target);
  const childrenTarget = renderNodeClipsChildren(renderNode)
    ? createClippedRenderTarget(target, node.bounds, node.viewport)
    : target;
  renderRenderNode(renderNode, {
    layoutNode: node,
    buffer: renderTarget,
    theme,
    widthProfile,
    focus: renderFocusRelation(focusPath, path),
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    renderChildren(requestedTarget = childrenTarget) {
      renderRenderNodeChildrenToRegions(
        renderNode,
        node,
        path,
        requestedTarget,
        requestedTarget === childrenTarget,
        region,
        composer,
        theme,
        widthProfile,
        focusPath
      );
    }
  });
}

function renderRenderNodeChildrenToRegions<TMessage>(
  renderNode: RenderNode<TMessage>,
  node: LayoutNode,
  path: FocusPath,
  buffer: RenderTarget,
  composeRegions: boolean,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined
): void {
  const children = renderNode.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (!composeRegions) {
      renderRenderNodeToBuffer(
        child,
        childNode,
        path,
        buffer,
        theme,
        widthProfile,
        focusPath
      );
      continue;
    }
    const childRegion = childNode.layer.zIndex === region.zIndex
      ? region
      : composer.regionFor(child, childNode, nodePath(childNode, path));
    renderRenderNodeToRegion(
      child,
      childNode,
      path,
      childRegion,
      composer,
      theme,
      widthProfile,
      focusPath,
      childRegion === region ? buffer : childRegion.buffer
    );
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
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  const renderTarget = targetForRenderNode(renderNode, node, buffer);
  renderRenderNode(renderNode, {
    layoutNode: node,
    buffer: renderTarget,
    theme,
    widthProfile,
    focus: renderFocusRelation(focusPath, path),
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    renderChildren(target = buffer) {
      const childTarget = renderNodeClipsChildren(renderNode)
        ? createClippedRenderTarget(target, node.bounds, node.viewport)
        : target;
      for (const { child, childNode } of orderedChildren(renderNode.children ?? [], node)) {
        renderRenderNodeToBuffer(
          child,
          childNode,
          path,
          childTarget,
          theme,
          widthProfile,
          focusPath
        );
      }
    }
  });
}

function targetForRenderNode(
  renderNode: RenderNode,
  node: LayoutNode,
  target: RenderTarget
): RenderTarget {
  return renderNode.kind === 'component'
    ? createLocalComponentRenderTarget(target, node.bounds, node.viewport, {
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        name: renderNodeFactoryName(renderNode),
        rendererFamily: 'component'
      })
    : target;
}

function nodePath(node: LayoutNode, parentPath: FocusPath): FocusPath {
  return layoutFocusPath(parentPath, node);
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
  regionFor(renderNode: RenderNode, node: LayoutNode, path: FocusPath): DraftRenderRegion;
  snapshot(
    index: RegionTargetIndex<TMessage>,
    theme: TerminalTheme,
    widthProfile: TextWidthProfile
  ): readonly RenderRegion<TMessage>[];
}

function createRegionComposer<TMessage>(
  terminalSize: TerminalSize,
  widthProfile: TextWidthProfile,
  decorativeNodes: ReadonlySet<RenderNode>
): RegionComposer<TMessage> {
  const regions: DraftRenderRegion[] = [];
  let regionOrder = 0;
  return {
    regionFor(renderNode, node, path) {
      const backdropBounds = renderNode.layer?.backdrop === 'viewport'
        ? { row: 1, column: 1, width: terminalSize.columns, height: terminalSize.rows }
        : undefined;
      const region = createDraftRenderRegion({
        id: regionIdForLayoutNode(node, path),
        zIndex: node.layer.zIndex,
        order: regionOrder,
        terminalSize,
        bounds: intersectRects(node.layer.bounds, node.viewport) ?? {
          row: node.viewport.row,
          column: node.viewport.column,
          width: 0,
          height: 0
        },
        underlay: node.layer.underlay,
        ...(backdropBounds === undefined ? {} : { backdropBounds }),
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
            ...(region.backdropBounds === undefined ? {} : { backdropBounds: region.backdropBounds }),
            cells: snapshot.cells,
            metadata: snapshot.metadata,
            hitTargets: frameHitTargets(
              index.layoutTargetsForRegion(region.zIndex, region.bounds),
              theme,
              snapshotWidthProfile,
              region,
              decorativeNodes
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
    if (region.backdropBounds !== undefined) applyModalBackdrop(buffer, region.backdropBounds);
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

function applyModalBackdrop(buffer: FrameBuffer, bounds: Rect): void {
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    for (let column = bounds.column; column < bounds.column + bounds.width; column += 1) {
      const cell = buffer.readCell(row, column);
      if (cell?.continuation === true) continue;
      if (cell === undefined) {
        buffer.write(row, column, [{
          text: ' ',
          style: {
            bg: { kind: 'theme', token: 'surface.backdrop' },
            dim: true
          }
        }]);
        continue;
      }
      const unlinked = { ...cell };
      Reflect.deleteProperty(unlinked, 'link');
      blitFrameCell(buffer, {
        ...unlinked,
        style: {
          ...cell.style,
          bg: { kind: 'theme', token: 'surface.backdrop' },
          dim: true
        }
      });
    }
  }
}

function applyThemeCanvas(buffer: FrameBuffer, theme: TerminalTheme): void {
  if (theme.tokens.colors['app.background'] === undefined) return;
  const canvasStyle = {
    ...(theme.tokens.colors['app.foreground'] === undefined
      ? {}
      : { fg: { kind: 'theme' as const, token: 'app.foreground' as const } }),
    bg: { kind: 'theme' as const, token: 'app.background' as const }
  };
  for (const cell of buffer.snapshot().cells) {
    if (cell.continuation === true) continue;
    blitFrameCell(buffer, {
      ...cell,
      style: {
        ...canvasStyle,
        ...cell.style
      }
    });
  }
  for (let row = 1; row <= buffer.height; row += 1) {
    for (let column = 1; column <= buffer.width; column += 1) {
      if (buffer.readCell(row, column) !== undefined) continue;
      buffer.write(row, column, [{ text: ' ', style: canvasStyle }]);
    }
  }
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
  focusPath: FocusPath | undefined
): { readonly row: number; readonly column: number } | undefined {
  const target = findRenderNodeFocusTarget(renderNode, layout, focusPath);
  if (target === undefined) return undefined;
  return target.cursor ?? { row: target.bounds.row, column: target.bounds.column };
}
