import { createAccessibleSnapshot } from '../../accessibility/index.ts';
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
import { frameSnapshotMetadata } from './frame-snapshot.ts';
import { createFrameBuffer } from './frame.ts';
import {
  applyImplicitCanvasBackdrop,
  blitFrameCell,
  captureFrameBufferDamage,
  transferFrameCell,
} from './frame-buffer.ts';
import { applyCursorStyle } from './cursor-style.ts';
import { applyFramePasses, boxDrawingJoinPass } from './frame-passes/index.ts';
import { layoutRenderNode } from './layout.ts';
import {
  accountAccessibleTree,
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
import { adoptRenderedAccessibility } from './component-output.ts';
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
import { createGraphicsBudget } from '../../graphics/index.ts';
import { GraphicsBudgetExceededError } from '../../graphics/index.ts';
import type { GraphicsBudgetLimits } from '../../graphics/index.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, FrameBuffer, FrameCell, FrameHitTarget } from './frame.ts';
import type { FramePass } from './frame-passes/index.ts';
import type {
  GraphicPlacement,
  LayoutNode,
  Rect,
  RenderInstrumentation,
  RenderStage,
  RenderTarget,
  RenderWorkMeasurement
} from '../contracts.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import { createRenderBudget } from './render-budget.ts';
import type { RenderBudget, RenderBudgetLimits } from './render-budget.ts';
import {
  pointerStateForOwner,
  type PointerVisualSnapshot,
} from '../../interaction/pointer-interaction.ts';

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
  readonly limits?: Partial<RenderBudgetLimits>;
  readonly graphicsBudget?: Partial<GraphicsBudgetLimits>;
}

interface InternalRenderElementOptions extends RenderElementOptions {
  readonly pointerVisuals?: PointerVisualSnapshot;
}

export interface InternalRenderResult<TMessage = unknown> {
  readonly node: RenderNode<TMessage>;
  readonly terminalSize: TerminalSize;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly postCompositionDamage: DirtyRegionSet;
  readonly frame: Frame;
  readonly limits: RenderBudgetLimits;
  readonly graphicsBudget: GraphicsBudgetLimits;
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
  options: InternalRenderElementOptions = {}
): InternalRenderResult<TMessage> {
  const renderNode = measureRenderStage(options.instrumentation, 'resolve_element', () => toRenderNode(element));
  const graphicsBudget = createGraphicsBudget(options.graphicsBudget);
  const budget = createRenderBudget(options.limits, graphicsBudget);
  const environment = createRenderEnvironment({
    terminalSize,
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.widthProfile === undefined ? {} : { widthProfile: options.widthProfile })
  });
  const { theme, widthProfile } = environment;
  const layout = measureRenderStage(options.instrumentation, 'layout', () =>
    layoutRenderNode(renderNode, terminalSize, theme, widthProfile, budget)
  );
  recordRenderWork(options.instrumentation, { kind: 'render_nodes', count: budget.nodeCount() });
  return materializeRenderNode(renderNode, environment.terminalSize, theme, widthProfile, layout, budget, options);
}

/** Repaints a prepared render tree when only focus-dependent output changed. */
export function rerenderElementInternal<TMessage>(
  prepared: Pick<InternalRenderResult<TMessage>, 'node' | 'terminalSize' | 'theme' | 'widthProfile' | 'layout' | 'limits' | 'graphicsBudget'>,
  options: Pick<InternalRenderElementOptions, 'focusPath' | 'framePasses' | 'disableFramePasses' | 'instrumentation' | 'pointerVisuals'> = {},
): InternalRenderResult<TMessage> {
  return materializeRenderNode(
    prepared.node,
    prepared.terminalSize,
    prepared.theme,
    prepared.widthProfile,
    prepared.layout,
    createRenderBudget(prepared.limits, createGraphicsBudget(prepared.graphicsBudget)),
    options,
  );
}

function materializeRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  terminalSize: TerminalSize,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  layout: LayoutNode,
  budget: RenderBudget,
  options: Pick<InternalRenderElementOptions, 'focusPath' | 'framePasses' | 'disableFramePasses' | 'instrumentation' | 'pointerVisuals'>,
): InternalRenderResult<TMessage> {
  const decorativeNodes = decorativeSubtreeNodes(renderNode, layout);
  recordRenderWork(options.instrumentation, { kind: 'measured_nodes', count: budget.nodeCount() });
  recordRenderWork(options.instrumentation, { kind: 'rendered_nodes', count: budget.nodeCount() });
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
      decorativeNodes,
      budget,
      options.pointerVisuals,
    )
  );
  recordRenderWork(options.instrumentation, {
    kind: 'hit_target_candidates',
    count: regions.reduce((total, region) => total + region.hitTargets.length, 0)
  });
  const composition = measureRenderStage(options.instrumentation, 'composition', () => {
    return compositeRegions(terminalSize, regions, widthProfile, budget);
  });
  const buffer = composition.buffer;
  recordRenderWork(options.instrumentation, {
    kind: 'composed_cells',
    count: regions.reduce((total, region) => total + region.cells.length, 0)
  });
  let cursor: ReturnType<typeof cursorForFocusedRenderNode> = undefined;
  const postCompositionDamage = captureFrameBufferDamage(buffer, () => {
    measureRenderStage(options.instrumentation, 'frame_passes', () => {
      applyFramePasses(buffer, framePassesForOptions(options), { theme, terminalSize, widthProfile });
    });
    cursor = measureRenderStage(options.instrumentation, 'cursor', () => {
      const next = cursorForFocusedRenderNode(renderNode, layout, resolvedFocusPath);
      applyCursorStyle(buffer, next);
      return next;
    });
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
      widthProfile,
      false,
      new Map(),
      budget,
    );
    const relatedRoot = accessibleRoot ?? inertAccessibleRoot();
    accountAccessibleTree(relatedRoot, budget);
    let snapshot;
    try {
      snapshot = createAccessibleSnapshot({
        source: 'renderer',
        root: withControlLabelRelationships(relatedRoot, budget),
        ...(composition.diagnostic === undefined ? {} : { diagnostics: [composition.diagnostic] }),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new TypeError(`Renderer returned invalid accessibility: ${detail}`, { cause });
    }
    return adoptRenderedAccessibility(snapshot, resolvedFocusPath !== undefined);
  });
  const frame = measureRenderStage(options.instrumentation, 'snapshot', () => buffer.snapshot({
      accessibility,
      ...canvasStyleSnapshotOptions(theme),
      ...(hitTargets.length === 0 ? {} : { hitTargets }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
    }));
  recordRenderWork(options.instrumentation, { kind: 'snapshot_rows', count: frame.height });
  recordRenderWork(options.instrumentation, { kind: 'snapshot_cells', count: frame.cells.length });
  recordRenderWork(options.instrumentation, { kind: 'emitted_cells', count: frame.cells.length });
  return {
    node: renderNode,
    terminalSize,
    theme,
    widthProfile,
    layout,
    regions,
    postCompositionDamage,
    frame,
    limits: budget.limits,
    graphicsBudget: budget.graphicsLimits,
  };
}

function recordRenderWork(
  instrumentation: RenderInstrumentation | undefined,
  measurement: RenderWorkMeasurement
): void {
  instrumentation?.recordWork?.(measurement);
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
  decorativeNodes: ReadonlySet<RenderNode>,
  budget: RenderBudget,
  pointerVisuals: PointerVisualSnapshot | undefined,
): readonly RenderRegion<TMessage>[] {
  const composer = createRegionComposer<TMessage>(terminalSize, widthProfile, decorativeNodes, budget);
  const path = nodePath(layout, []);
  renderRenderNodeToRegion(
    renderNode,
    layout,
    [],
    composer.regionFor(renderNode, layout, path),
    composer,
    theme,
    widthProfile,
    focusPath,
    pointerVisuals,
  );
  return composer.snapshot(createRegionTargetIndex(renderNode, layout), theme, widthProfile);
}

function frameHitTargets<TMessage>(
  targets: readonly import('./focus.ts').RenderNodeLayoutTarget<TMessage>[],
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  region: DraftRenderRegion,
  decorativeNodes: ReadonlySet<RenderNode>,
  budget: RenderBudget,
): readonly RenderRegionHitTarget<TMessage>[] {
  const result = targets
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
  budget.addHitTargets(result.length);
  return result;
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
  pointerVisuals: PointerVisualSnapshot | undefined,
  target: RenderTarget = region.buffer
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  const pointerState = pointerStateForOwner(
    pointerVisuals,
    hitTargetOwnerIdentity(path, node.identity),
  );
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
    ...(pointerState === undefined ? {} : { pointerState }),
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
        focusPath,
        pointerVisuals,
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
  focusPath: FocusPath | undefined,
  pointerVisuals: PointerVisualSnapshot | undefined,
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
        focusPath,
        pointerVisuals,
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
      pointerVisuals,
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
  focusPath: FocusPath | undefined,
  pointerVisuals: PointerVisualSnapshot | undefined,
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  const pointerState = pointerStateForOwner(
    pointerVisuals,
    hitTargetOwnerIdentity(path, node.identity),
  );
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  const renderTarget = targetForRenderNode(renderNode, node, buffer);
  renderRenderNode(renderNode, {
    layoutNode: node,
    buffer: renderTarget,
    theme,
    widthProfile,
    focus: renderFocusRelation(focusPath, path),
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    ...(pointerState === undefined ? {} : { pointerState }),
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
          focusPath,
          pointerVisuals,
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
        graphicId: renderNode.id ?? node.identity,
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
  decorativeNodes: ReadonlySet<RenderNode>,
  budget: RenderBudget,
): RegionComposer<TMessage> {
  const regions: DraftRenderRegion[] = [];
  let regionOrder = 0;
  return {
    regionFor(renderNode, node, path) {
      budget.addRegions();
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
          const metadata = frameSnapshotMetadata(snapshot);
          if (metadata === undefined) throw new Error('Framework frame snapshot metadata is unavailable.');
          return {
            id: region.id,
            zIndex: region.zIndex,
            order: region.order,
            bounds: region.bounds,
            underlay: region.underlay,
            ...(region.backdropBounds === undefined ? {} : { backdropBounds: region.backdropBounds }),
            cells: snapshot.cells,
            graphics: snapshot.graphics,
            metadata,
            hitTargets: frameHitTargets(
              index.layoutTargetsForRegion(region.zIndex, region.bounds),
              theme,
              snapshotWidthProfile,
              region,
              decorativeNodes,
              budget,
            ),
            focusTargets: index.focusTargetsForRegion(region.zIndex, region.bounds)
          };
        });
    }
  };
}

function compositeRegions(
  terminalSize: TerminalSize,
  regions: readonly RenderRegion[],
  widthProfile: TextWidthProfile,
  budget?: RenderBudget,
): { readonly buffer: FrameBuffer; readonly diagnostic?: TerminalDiagnostic } {
  const buffer = createFrameBuffer(terminalSize.columns, terminalSize.rows, { widthProfile });
  let graphicsAllowed = true;
  let graphicsDiagnostic: TerminalDiagnostic | undefined;
  if (budget !== undefined) {
    const placementCount = regions.reduce((count, region) => count + region.graphics.length, 0);
    try {
      budget.addGraphicsPlacements(placementCount);
    } catch (cause) {
      if (!(cause instanceof GraphicsBudgetExceededError)) throw cause;
      graphicsAllowed = false;
      graphicsDiagnostic = graphicsLimitDiagnostic(cause);
    }
  }
  let canvasBackdropActive = false;
  for (const region of regions.toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)) {
    if (region.backdropBounds !== undefined) {
      buffer.occludeGraphics(region.backdropBounds);
      canvasBackdropActive = applyModalBackdrop(buffer, region.backdropBounds) || canvasBackdropActive;
    }
    if (region.underlay === 'clear') {
      buffer.clear(region.bounds);
      for (const cell of region.cells) {
        transferFrameCell(buffer, canvasBackdropActive ? aboveBackdrop(cell) : cell);
      }
      if (graphicsAllowed) placeRegionGraphics(buffer, region.graphics);
      continue;
    }
    if (region.underlay === 'inheritBackground') {
      for (const cell of region.cells) {
        const inherited = withInheritedBackground(cell, buffer.readCell(cell.row, cell.column));
        transferFrameCell(buffer, canvasBackdropActive ? aboveBackdrop(inherited) : inherited);
      }
      if (graphicsAllowed) placeRegionGraphics(buffer, region.graphics);
      continue;
    }
    for (const cell of region.cells) {
      transferFrameCell(buffer, canvasBackdropActive ? aboveBackdrop(cell) : cell);
    }
    if (graphicsAllowed) placeRegionGraphics(buffer, region.graphics);
  }
  return {
    buffer,
    ...(graphicsDiagnostic === undefined ? {} : { diagnostic: graphicsDiagnostic }),
  };
}

function placeRegionGraphics(
  buffer: FrameBuffer,
  graphics: readonly GraphicPlacement[],
): void {
  for (const graphic of graphics) {
    buffer.occludeGraphics(graphic.clip);
    buffer.placeGraphic(graphic);
  }
}

function graphicsLimitDiagnostic(cause: GraphicsBudgetExceededError): TerminalDiagnostic {
  return diagnostic(
    'TUI_GRAPHICS_LIMIT_EXCEEDED',
    'Terminal graphics exceeded its configured resource budget; the text fallback was retained.',
    {
      severity: 'warning',
      data: {
        resource: cause.resource,
        limit: cause.limit,
        requested: Number.isFinite(cause.requested) ? cause.requested : String(cause.requested),
      },
    },
  );
}

const backdropStyle: TerminalStyle = Object.freeze({
  bg: { kind: 'theme' as const, token: 'surface.backdrop' as const },
  dim: true,
});

function applyModalBackdrop(buffer: FrameBuffer, bounds: Rect): boolean {
  if (applyImplicitCanvasBackdrop(buffer, bounds, backdropStyle)) return true;
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    for (let column = bounds.column; column < bounds.column + bounds.width; column += 1) {
      const cell = buffer.readCell(row, column);
      if (cell?.continuation === true) continue;
      if (cell === undefined) {
        buffer.write(row, column, [{
          text: ' ',
          style: backdropStyle,
        }]);
        continue;
      }
      const unlinked = { ...cell };
      Reflect.deleteProperty(unlinked, 'link');
      blitFrameCell(buffer, {
        ...unlinked,
        style: {
          ...cell.style,
          ...backdropStyle,
        }
      });
    }
  }
  return false;
}

function aboveBackdrop(cell: FrameCell): FrameCell {
  return Object.freeze({
    ...cell,
    style: Object.freeze({ ...cell.style, dim: false }),
  });
}

function canvasStyleSnapshotOptions(theme: TerminalTheme): { readonly canvasStyle?: TerminalStyle } {
  if (theme.tokens.colors['app.background'] === undefined) return {};
  return {
    canvasStyle: {
    ...(theme.tokens.colors['app.foreground'] === undefined
      ? {}
      : { fg: { kind: 'theme' as const, token: 'app.foreground' as const } }),
    bg: { kind: 'theme' as const, token: 'app.background' as const }
    }
  };
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
