import { decodeAccessibleSnapshotWithPolicy } from '../../accessibility/validate.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { Element } from '../../element/types.ts';
import { intersectRects, sameRect } from '../../geometry/rect.ts';
import type { Rect, TerminalSize } from '../../geometry/types.ts';
import type { GraphicsBudgetLimits } from '../../graphics/budget.ts';
import { createGraphicsBudget, GraphicsBudgetExceededError } from '../../graphics/budget.ts';
import type { GraphicPlacement } from '../../graphics/types.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import {
  pointerStateForOwner,
  samePointerVisualSnapshot,
  type PointerVisualSnapshot,
} from '../../interaction/pointer-interaction.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';
import type {
  Frame,
  FrameCell,
  FrameHitTarget,
  LayoutNode,
  RenderInstrumentation,
  RenderStage,
  RenderTarget,
} from '../contracts.ts';
import type { FrameBuffer, FrameBufferCheckpoint, FrameBufferSnapshot } from '../frame-buffer.ts';
import {
  applyImplicitCanvasBackdrop,
  applyRetainedCanvasBackdrop,
  blitFrameCell,
  captureFrameBufferDamage,
  checkpointFrameBuffer,
  createFrameBuffer,
  frameSnapshotWork,
  restoreFrameBufferStorage,
  transferFrameCell,
} from '../frame-buffer.ts';
import { boxDrawingJoinPass } from '../frame-passes/box-drawing-join.ts';
import type { FramePass } from '../frame-passes/frame-pass.ts';
import { applyFramePasses } from '../frame-passes/frame-pass.ts';
import type { RenderBudget, RenderBudgetLimits } from '../render-budget.ts';
import { createRenderBudget } from '../render-budget.ts';
import type { RenderElementOptions } from '../render-options.ts';
import { decodeRenderedAccessibility } from './component-output.ts';
import { applyCursorStyle } from './cursor-style.ts';
import type { DirtyRegionSet } from './damage-contracts.ts';
import { assertDecorativeNodeHasNoHitTargets, decorativeSubtreeNodes } from './decorative.ts';
import {
  findRenderNodeFocusTarget,
  focusedTargetIdForLayoutNode,
  focusPathForLayoutTarget,
  layoutFocusPath,
  renderFocusRelation,
  renderNodeLayoutAncestorsForFocus,
  resolveFocusPath,
} from './focus.ts';
import { frameSnapshotMetadata, snapshotRow } from './frame-snapshot.ts';
import type { FrameSnapshotRowIndex } from './frame-snapshot.ts';
import { sameFrameCell } from './frame-cell-equality.ts';
import { DirtyCoverageAccumulator } from './dirty-coverage.ts';
import type { RegionTargetIndex } from './region-target-index.ts';
import { createRegionTargetIndex } from './region-target-index.ts';
import {
  accessibleNode,
  AccessibleRelationshipError,
  accessibleSourceForTarget,
  accountAccessibleTree,
  commitAccessibleRetention,
  inertAccessibleRoot,
  withControlLabelRelationships,
} from './render-accessibility.ts';
import { createRenderEnvironment } from './render-environment.ts';
import {
  hitTargetsForRenderNode,
  renderRenderNode,
} from './render-node-behavior.ts';
import type { DraftRenderRegion, RenderRegion, RenderRegionHitTarget } from './render-regions.ts';
import {
  createDraftRenderRegion,
  hitTargetOwnerIdentity,
  regionIdForLayoutNode,
  renderNodeStartsRegion,
  toRegionHitTarget,
} from './render-regions.ts';
import { layoutRenderTree } from './render-tree-layout.ts';
import { toRenderNode } from './render-tree/element.ts';
import { renderNodeFactoryName } from './render-tree/node.ts';
import { textPresentationForLayout } from './layout-text-context.ts';
import type { RenderNode, RenderNodeRenderInput } from './render-tree/types.ts';
import { createPaintRetention } from './retained-paint.ts';
import {
  createClippedRenderTarget,
  createLocalComponentRenderTarget,
} from './scoped-render-target.ts';

interface InternalRenderElementOptions extends RenderElementOptions {
  readonly previous?: Pick<InternalRenderResult, 'regions' | 'frame' | 'pointerVisuals' | 'node' | 'layout'>;
  readonly pointerVisuals?: PointerVisualSnapshot;
  readonly focusPathForLayout?: (layout: LayoutNode) => FocusPath | undefined;
}

type MaterializeOptions = Pick<InternalRenderElementOptions,
  'framePasses' | 'disableFramePasses' | 'instrumentation' | 'pointerVisuals'> & {
  readonly focusPath?: FocusPath | undefined;
};

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
  readonly pointerVisuals?: PointerVisualSnapshot;
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
    textPresentation: options.textPresentation,
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.widthProfile === undefined ? {} : { widthProfile: options.widthProfile })
  });
  const { theme, widthProfile } = environment;
  const resolved = measureRenderStage(options.instrumentation, 'layout', () =>
    layoutRenderTree(renderNode, terminalSize, theme, widthProfile, budget, options.instrumentation, options.previous?.layout, environment.textPresentation)
  );
  const paintOptions = options.focusPathForLayout === undefined
    ? options
    : { ...options, focusPath: options.focusPathForLayout(resolved.layout) };
  return materializeRenderNode(resolved.node, environment.terminalSize, theme, widthProfile, resolved.layout, budget, paintOptions, options.previous as Pick<InternalRenderResult<TMessage>, 'regions' | 'frame' | 'pointerVisuals' | 'node' | 'layout'> | undefined);
}

/** Repaints a previous render tree when only focus-dependent output changed. */
export function rerenderElementInternal<TMessage>(
  previous: Pick<InternalRenderResult<TMessage>, 'node' | 'terminalSize' | 'theme' | 'widthProfile' | 'layout' | 'limits' | 'graphicsBudget' | 'regions' | 'frame' | 'pointerVisuals'    >,
  options: Pick<InternalRenderElementOptions, 'focusPath' | 'framePasses' | 'disableFramePasses' | 'instrumentation' | 'pointerVisuals'> = {},
): InternalRenderResult<TMessage> {
  return materializeRenderNode(
    previous.node,
    previous.terminalSize,
    previous.theme,
    previous.widthProfile,
    previous.layout,
    createRenderBudget(previous.limits, createGraphicsBudget(previous.graphicsBudget)),
    options,
    previous,
  );
}

function materializeRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  terminalSize: TerminalSize,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  layout: LayoutNode,
  budget: RenderBudget,
  options: MaterializeOptions,
  previous?: Pick<InternalRenderResult<TMessage>, 'regions' | 'frame' | 'pointerVisuals' | 'node' | 'layout'>,
): InternalRenderResult<TMessage> {
  const decorativeNodes = decorativeSubtreeNodes(renderNode, layout);
  const resolvedFocusPath = measureRenderStage(options.instrumentation, 'focus', () =>
    resolveFocusPath(layout, options.focusPath, options.instrumentation)
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
      options.instrumentation,
      previous,
    )
  );
  if (options.instrumentation?.recordWork !== undefined) {
    options.instrumentation.recordWork({
      kind: 'hit_targets',
      count: regions.reduce((total, region) => total + region.hitTargets.length, 0)
    });
  }
  const composition = measureRenderStage(options.instrumentation, 'composition', () => {
    return compositeRegions(terminalSize, regions, widthProfile, budget, options.instrumentation, previous?.regions);
  });
  const buffer = composition.buffer;
  if (options.instrumentation?.recordWork !== undefined) {
    options.instrumentation.recordWork({
      kind: 'region_cells',
      count: regions.reduce((total, region) => total + region.metadata.rowIndexes.reduce((count, row) => count + row.cells.size, 0), 0)
    });
  }
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
    const accessibleNodes = new Map<RenderNode, import('../../accessibility/index.ts').AccessibleNode>();
    const accessibleRoot = accessibleNode(
      renderNode,
      layout,
      [],
      resolvedFocusPath,
      theme,
      widthProfile,
      false,
      accessibleNodes,
      budget,
      0,
      options.instrumentation,
    );
    const relatedRoot = accessibleRoot ?? inertAccessibleRoot();
    accountAccessibleTree(relatedRoot, budget);
    let related;
    try {
      related = withControlLabelRelationships(relatedRoot, budget);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const source = cause instanceof AccessibleRelationshipError
        ? accessibleSourceForTarget(relatedRoot, accessibleNodes, cause.target)
        : undefined;
      throw new TypeError(
        `Renderer returned invalid accessibility${source === undefined ? '' : ` from ${source}`}: ${detail}`,
        { cause },
      );
    }
    const result = decodeAccessibleSnapshotWithPolicy({
      source: 'renderer',
      root: related,
      ...(composition.diagnostic === undefined ? {} : { diagnostics: [composition.diagnostic] }),
    }, true);
    if (result.status === 'failure') {
      const source = accessibleSourceForTarget(related, accessibleNodes, result.error.target ?? related.id);
      throw new TypeError(
        `Renderer returned invalid accessibility${source === undefined ? '' : ` from ${source}`}: ${result.error.message}`,
        { cause: result.error },
      );
    }
    const accessibility = decodeRenderedAccessibility(result.value, resolvedFocusPath !== undefined);
    commitAccessibleRetention(accessibleNodes);
    return accessibility;
  });
  const frame = measureRenderStage(options.instrumentation, 'snapshot', () => buffer.snapshot({
      accessibility,
      ...canvasStyleSnapshotOptions(theme),
      ...(hitTargets.length === 0 ? {} : { hitTargets }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(resolvedFocusPath === undefined ? {} : { focusPath: resolvedFocusPath })
    }));
  if (options.instrumentation?.recordWork !== undefined) {
    const work = frameSnapshotWork(frame);
    options.instrumentation.recordWork({ kind: 'snapshot_rows', count: work.rows });
    options.instrumentation.recordWork({ kind: 'snapshot_cells', count: work.cells });
  }
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
    ...(options.pointerVisuals === undefined ? {} : { pointerVisuals: options.pointerVisuals }),
  };
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

function framePassesForOptions(options: Pick<RenderElementOptions, 'framePasses' | 'disableFramePasses'>): readonly FramePass[] {
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
  instrumentation?: RenderInstrumentation,
  previous?: Pick<InternalRenderResult<TMessage>, 'regions' | 'frame' | 'pointerVisuals' | 'node' | 'layout'>,
): readonly RenderRegion<TMessage>[] {
  const composer = measureRenderStage(instrumentation, 'region_painting', () => {
    const oldFocus = previous?.frame.focusPath;
    const changedInteraction = previous?.node === renderNode && previous.layout === layout && (
      !sameOptionalFocusPath(oldFocus, focusPath)
      || !samePointerVisualSnapshot(previous.pointerVisuals, pointerVisuals)
    );
    const affected = changedInteraction
      ? affectedRegions(renderNode, layout, oldFocus, focusPath, previous.pointerVisuals, pointerVisuals)
      : undefined;
    const composer = createRegionComposer<TMessage>(
      terminalSize, widthProfile, decorativeNodes, budget, instrumentation,
      previous?.regions,
      affected,
    );
    const path = nodePath(layout, []);
    if (layout.visible && !composer.reuseFor(renderNode, layout, [])) {
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
        instrumentation,
      );
    }
    return composer;
  });
  const index = measureRenderStage(instrumentation, 'region_targets', () =>
    createRegionTargetIndex(renderNode, layout, instrumentation)
  );
  const regions = composer.snapshot(index, theme, widthProfile);
  composer.painting.commit(regions);
  return regions;
}

function sameOptionalFocusPath(left: FocusPath | undefined, right: FocusPath | undefined): boolean {
  return left === undefined ? right === undefined : left.length === right?.length
    && left.every((segment, index) => segment === right[index]);
}

function affectedRegions<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  oldFocus: FocusPath | undefined,
  newFocus: FocusPath | undefined,
  oldPointer: PointerVisualSnapshot | undefined,
  newPointer: PointerVisualSnapshot | undefined,
): ReadonlySet<string> {
  const index = regionDependencyIndex(renderNode, layout);
  const affected = new Set<string>();
  const mark = (entry: RegionDependencyEntry | undefined): void => {
    if (entry === undefined) return;
    for (let ancestor: RegionDependencyEntry | undefined = entry; ancestor !== undefined; ancestor = ancestor.parent) {
      affected.add(ancestor.regionId);
    }
    const visit = (current: RegionDependencyEntry): void => {
      affected.add(current.regionId);
      for (const child of current.children) visit(child);
    };
    visit(entry);
  };
  if (!sameOptionalFocusPath(oldFocus, newFocus)) {
    const paths = [oldFocus, newFocus].filter((path): path is FocusPath => path !== undefined);
    const candidates = new Set(paths.flatMap((path) => renderNodeLayoutAncestorsForFocus(renderNode, layout, path))
      .map((target) => index.byLayout.get(target.layoutNode))
      .filter((entry): entry is RegionDependencyEntry => entry !== undefined));
    for (const entry of candidates) {
      if (renderFocusRelation(oldFocus, entry.path) !== renderFocusRelation(newFocus, entry.path)
        || focusedTargetIdForLayoutNode(entry.layout, entry.path, oldFocus)
          !== focusedTargetIdForLayoutNode(entry.layout, entry.path, newFocus)) {
        mark(entry);
      }
    }
  }
  if (!samePointerVisualSnapshot(oldPointer, newPointer)) {
    for (const owner of [oldPointer?.hovered?.ownerIdentity, oldPointer?.pressed?.ownerIdentity,
      newPointer?.hovered?.ownerIdentity, newPointer?.pressed?.ownerIdentity]) {
      if (owner !== undefined) mark(index.byOwner.get(owner));
    }
  }
  return affected;
}

interface RegionDependencyEntry {
  readonly path: FocusPath;
  readonly layout: LayoutNode;
  readonly regionId: string;
  readonly parent?: RegionDependencyEntry;
  readonly children: RegionDependencyEntry[];
}

interface RegionDependencyIndex {
  readonly byLayout: WeakMap<LayoutNode, RegionDependencyEntry>;
  readonly byOwner: ReadonlyMap<string, RegionDependencyEntry>;
}

const regionDependencyCache = new WeakMap<LayoutNode, {
  readonly node: RenderNode;
  readonly index: RegionDependencyIndex;
}>();

function regionDependencyIndex<TMessage>(renderNode: RenderNode<TMessage>, layout: LayoutNode): RegionDependencyIndex {
  const cached = regionDependencyCache.get(layout);
  if (cached?.node === renderNode) return cached.index;
  const byLayout = new WeakMap<LayoutNode, RegionDependencyEntry>();
  const byOwner = new Map<string, RegionDependencyEntry>();
  const visit = (
    current: RenderNode, node: LayoutNode, parentPath: FocusPath,
    parent: RegionDependencyEntry | undefined,
  ): void => {
    if (!node.visible) return;
    const path = nodePath(node, parentPath);
    const regionId = parent !== undefined && !renderNodeStartsRegion(current, node, parent.layout.layer.zIndex)
      ? parent.regionId
      : regionIdForLayoutNode(node, path);
    const entry: RegionDependencyEntry = {
      path, layout: node, regionId,
      ...(parent === undefined ? {} : { parent }),
      children: [],
    };
    parent?.children.push(entry);
    byLayout.set(node, entry);
    byOwner.set(hitTargetOwnerIdentity(path, node.identity), entry);
    for (const [position, child] of (current.children ?? []).entries()) {
      const childLayout = node.children[position];
      if (childLayout !== undefined) visit(child, childLayout, path, entry);
    }
  };
  visit(renderNode, layout, [], undefined);
  const index = { byLayout, byOwner };
  regionDependencyCache.set(layout, { node: renderNode, index });
  return index;
}

function frameHitTargets<TMessage>(
  targets: readonly import('./focus.ts').RenderNodeLayoutTarget<TMessage>[],
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  region: DraftRenderRegion,
  decorativeNodes: ReadonlySet<RenderNode>,
  budget: RenderBudget,
): readonly RenderRegionHitTarget<TMessage>[] {
  const sensitivePaths = new Set(targets
    .filter((target) => target.renderNode.kind === 'component' && target.renderNode.definition.sensitiveInput)
    .map((target) => target.path.join('\u0000')));
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
              resolveHitTargetFocus(hitTarget, target),
              target.path.some((_, index) => sensitivePaths.has(target.path.slice(0, index + 1).join('\u0000')))
                || sensitivePaths.has('')
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
  instrumentation: RenderInstrumentation | undefined,
  target: RenderTarget = region.buffer
): void {
  if (!node.visible) return;
  const path = nodePath(node, parentPath);
  const pointerState = pointerStateForOwner(
    pointerVisuals,
    hitTargetOwnerIdentity(path, node.identity),
  );
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  let cellOccupied: (row: number, column: number) => boolean = () => false;
  const input = {
    renderNode, layoutNode: node, buffer: target, theme, widthProfile,
    textPresentation: textPresentationForLayout(node),
    focus: renderFocusRelation(focusPath, path),
    ...(focusedTargetId === undefined ? {} : { focusedTargetId }),
    ...(pointerState === undefined ? {} : { pointerState }),
    cellOccupied: (row: number, column: number) => cellOccupied(row, column),
  };
  // Paint retention captures leaves only. Both paths invoke exactly the same
  // bounded, auto-closed paint scope; subtree traversal remains renderer-owned.
  if (composer.painting.paint(input, path, buffer => {
    paintRenderNode(renderNode, { ...input, buffer, renderChildren() { /* Retained paint applies only to leaves. */ } }, instrumentation);
  })) return;
  paintRenderNode(renderNode, {
    ...input,
    renderChildren() {
      const paint = (): void => {
        renderRenderNodeChildrenToRegions(
          renderNode, node, path, region, composer, theme, widthProfile,
          focusPath, pointerVisuals, instrumentation,
        );
      };
      if (renderNode.kind === 'viewport') cellOccupied = composer.contentCoverage(region, paint);
      else paint();
    },
  }, instrumentation);
}

function paintRenderNode<TMessage>(
  renderNode: RenderNode<TMessage>,
  input: RenderNodeRenderInput<TMessage>,
  instrumentation: RenderInstrumentation | undefined,
): void {
  const localTarget = targetForRenderNode(renderNode, input.layoutNode, input.buffer);
  try {
    renderRenderNode(renderNode, { ...input, buffer: localTarget.target }, instrumentation);
  } finally {
    localTarget.close();
  }
}

function renderRenderNodeChildrenToRegions<TMessage>(
  renderNode: RenderNode<TMessage>,
  node: LayoutNode,
  path: FocusPath,
  region: DraftRenderRegion,
  composer: RegionComposer<TMessage>,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focusPath: FocusPath | undefined,
  pointerVisuals: PointerVisualSnapshot | undefined,
  instrumentation: RenderInstrumentation | undefined,
): void {
  const children = renderNode.children ?? [];
  for (const { child, childNode } of orderedChildren(children, node)) {
    if (!childNode.visible) continue;
    const separateRegion = renderNodeStartsRegion(child, childNode, region.zIndex);
    const childPath = nodePath(childNode, path);
    if (separateRegion && composer.reuseFor(child, childNode, path)) continue;
    const childRegion = separateRegion
      ? composer.regionFor(child, childNode, childPath)
      : region;
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
      instrumentation,
      childRegion.buffer
    );
  }
}

function targetForRenderNode(
  renderNode: RenderNode,
  node: LayoutNode,
  target: RenderTarget
): { readonly target: RenderTarget; readonly close: () => void } {
  return renderNode.kind === 'component'
    ? createLocalComponentRenderTarget(target, node.bounds, node.viewport, {
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        graphicId: renderNode.id ?? node.identity,
        name: renderNodeFactoryName(renderNode),
        rendererFamily: 'component'
      })
    : { target: createClippedRenderTarget(target, node.viewport, node.viewport), close() { /* Structural targets are renderer-owned. */ } };
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
  readonly painting: ReturnType<typeof createPaintRetention>;
  contentCoverage(region: DraftRenderRegion, paint: () => void): (row: number, column: number) => boolean;
  reuseFor(renderNode: RenderNode, node: LayoutNode, parentPath: FocusPath): boolean;
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
  instrumentation?: RenderInstrumentation,
  previous?: readonly RenderRegion<TMessage>[],
  affected?: ReadonlySet<string>,
): RegionComposer<TMessage> {
  const painting = createPaintRetention(previous);
  const regions: DraftRenderRegion[] = [];
  const reused: RenderRegion<TMessage>[] = [];
  const prior = new Map(previous?.map((region) => [region.id, region]) ?? []);
  let regionOrder = 0;
  return {
    painting,
    contentCoverage(region, paint) {
      const firstRegion = regions.length;
      const firstReused = reused.length;
      // Shared storage may already contain earlier siblings. Existing damage
      // scopes record admitted writes (including unchanged retained writes),
      // so only this subtree's cells count as viewport content.
      const coverage = captureFrameBufferDamage(region.buffer, paint);
      const ownRegions = regions.slice(firstRegion);
      const ownReused = reused.slice(firstReused);
      return (row, column) => (coverage.rects.some(rect =>
        row >= rect.row && row < rect.row + rect.height
        && column >= rect.column && column < rect.column + rect.width)
        && region.buffer.readCell(row, column) !== undefined)
        || ownRegions.some(child => child.buffer.readCell(row, column) !== undefined)
        || ownReused.some(child => snapshotRow(child.metadata, row)?.cells.has(column) === true);
    },
    reuseFor(renderNode, node, parentPath) {
      const path = nodePath(node, parentPath);
      const id = regionIdForLayoutNode(node, path);
      if (affected === undefined || affected.has(id)) return false;
      const region = prior.get(id);
      if (region === undefined) return false;
      const include = (
        current: RenderNode, currentLayout: LayoutNode, parentPath: FocusPath,
        parentLayer: number | undefined,
      ): void => {
        if (!currentLayout.visible) return;
        const currentPath = nodePath(currentLayout, parentPath);
        painting.keep(current, currentLayout.identity, currentPath);
        if (renderNodeStartsRegion(current, currentLayout, parentLayer)) {
          const cached = prior.get(regionIdForLayoutNode(currentLayout, currentPath));
          if (cached !== undefined) {
            budget.addRegions();
            budget.addHitTargets(cached.hitTargets.length);
            reused.push(cached);
            regionOrder += 1;
          }
        }
        for (const [index, child] of (current.children ?? []).entries()) {
          const childLayout = currentLayout.children[index];
          if (childLayout !== undefined) include(child, childLayout, currentPath, currentLayout.layer.zIndex);
        }
      };
      include(renderNode, node, parentPath, undefined);
      return true;
    },
    regionFor(renderNode, node, path) {
      budget.addRegions();
      instrumentation?.recordWork?.({ kind: 'region_allocations', count: 1 });
      const backdropBounds = renderNode.layer?.backdrop === 'viewport'
        ? { row: 1, column: 1, width: terminalSize.columns, height: terminalSize.rows }
        : undefined;
      const priorRegion = prior.get(regionIdForLayoutNode(node, path));
      const bounds = intersectRects(node.layer.bounds, node.viewport) ?? { row: node.viewport.row, column: node.viewport.column, width: 0, height: 0 };
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
        textPresentation: textPresentationForLayout(node),
        ...(priorRegion !== undefined && sameRect(priorRegion.bounds, bounds) ? { previous: priorRegion.metadata } : {}),
        ...(backdropBounds === undefined ? {} : { backdropBounds }),
        widthProfile,
        ...(instrumentation === undefined ? {} : { instrumentation })
      });
      regionOrder += 1;
      regions.push(region);
      return region;
    },
    snapshot(index, theme, snapshotWidthProfile) {
      return Object.freeze([...reused, ...regions
        .toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order)
        .map((region): RenderRegion<TMessage> => {
          const snapshot = measureRenderStage(instrumentation, 'region_snapshot', () => region.buffer.snapshot());
          const metadata = frameSnapshotMetadata(snapshot);
          if (metadata === undefined) throw new Error('Framework frame snapshot metadata is unavailable.');
          const targets = measureRenderStage(instrumentation, 'region_targets', () => ({
            hitTargets: frameHitTargets(
              index.layoutTargetsForRegion(region.id, region.bounds),
              theme, snapshotWidthProfile, region, decorativeNodes, budget,
            ),
            focusTargets: index.focusTargetsForRegion(region.id, region.bounds),
          }));
          return regionSnapshot(snapshot, {
            id: region.id,
            zIndex: region.zIndex,
            order: region.order,
            bounds: region.bounds,
            underlay: region.underlay,
            ...(region.backdropBounds === undefined ? {} : { backdropBounds: region.backdropBounds }),
            graphics: snapshot.graphics,
            metadata,
            ...targets
          });
        })].toSorted((left, right) => left.zIndex - right.zIndex || left.order - right.order));
    }
  };
}

// Kept outside the composer closure: a published cells accessor must not retain
// the composer, its prior-region map, or any predecessor render history.
function regionSnapshot<TMessage>(
  snapshot: FrameBufferSnapshot, region: Omit<RenderRegion<TMessage>, 'cells'>,
): RenderRegion<TMessage> {
  return { ...region, get cells() { return snapshot.cells; } };
}

const composedStorage = new WeakMap<readonly RenderRegion[], FrameBufferCheckpoint>();

function compositeRegions(
  terminalSize: TerminalSize,
  regions: readonly RenderRegion[],
  widthProfile: TextWidthProfile,
  budget?: RenderBudget,
  instrumentation?: RenderInstrumentation,
  previous?: readonly RenderRegion[],
): { readonly buffer: FrameBuffer; readonly diagnostic?: TerminalDiagnostic } {
  const buffer = createFrameBuffer(terminalSize.columns, terminalSize.rows, {
    widthProfile,
    ...(instrumentation === undefined ? {} : { instrumentation })
  });
  const previousStorage = previous === undefined ? undefined : composedStorage.get(previous);
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
  const damage = retainedCompositionDamage(buffer, previous, previousStorage, regions, widthProfile);
  if (damage === undefined) composeRegionsInto(buffer, regions, graphicsAllowed, instrumentation);
  else {
    const byRow = compositionRegionsByRow(regions);
    for (const rect of damage.rects) {
      for (let row = rect.row; row < rect.row + rect.height; row += 1) {
        const interval = { ...rect, row, height: 1 };
        buffer.clear(interval);
        composeRegionsInto(buffer, byRow.get(row) ?? [], graphicsAllowed, instrumentation, interval);
      }
    }
  }
  composedStorage.set(regions, checkpointFrameBuffer(buffer));
  return { buffer, ...(graphicsDiagnostic === undefined ? {} : { diagnostic: graphicsDiagnostic }) };
}

function retainedCompositionDamage(
  buffer: FrameBuffer, previous: readonly RenderRegion[] | undefined,
  previousStorage: FrameBufferCheckpoint | undefined, regions: readonly RenderRegion[], widthProfile: TextWidthProfile,
): DirtyRegionSet | undefined {
  // Graphics fragmentation and changing backdrop surfaces use the same compositor
  // on its full bounds; ordinary text updates fork only pre-frame-pass storage.
  if (previous === undefined || previousStorage?.widthProfile.emoji !== widthProfile.emoji
    || previousStorage.widthProfile.ambiguous !== widthProfile.ambiguous
    || [...previous, ...regions].some(region => region.graphics.length > 0)
    || !sameBackdropSurfaces(previous, regions)
    || !restoreFrameBufferStorage(buffer, previousStorage)) return undefined;
  return compositionDamage(previous, regions);
}

/** One compositor handles both complete surfaces and damaged row intersections. */
function composeRegionsInto(
  buffer: FrameBuffer, regions: readonly RenderRegion[], graphicsAllowed: boolean,
  instrumentation?: RenderInstrumentation, damage?: Rect,
): void {
  let canvasBackdropActive = false;
  for (const region of regions) {
    if (region.backdropBounds !== undefined) {
      const bounds = damage ?? region.backdropBounds;
      buffer.occludeGraphics(bounds);
      if (damage === undefined) canvasBackdropActive = applyModalBackdrop(buffer, bounds) || canvasBackdropActive;
      else { applyRetainedCanvasBackdrop(buffer, bounds, backdropStyle); canvasBackdropActive = true; }
    }
    const intersection = damage === undefined ? region.bounds : intersectRects(damage, region.bounds);
    if (intersection === undefined) continue;
    if (region.underlay === 'clear') buffer.clear(intersection);
    const rows = damage === undefined ? region.metadata.rowIndexes : [snapshotRow(region.metadata, damage.row)];
    for (const row of rows) {
      if (row === undefined) continue;
      for (const cell of row.renderable) {
        if (damage !== undefined && (cell.column >= damage.column + damage.width || cell.column + cell.width <= damage.column)) continue;
        recordCellTransfer(instrumentation);
        const inherited = region.underlay === 'inheritBackground'
          ? withInheritedBackground(cell, buffer.readCell(cell.row, cell.column)) : cell;
        transferFrameCell(buffer, canvasBackdropActive ? aboveBackdrop(inherited) : inherited);
      }
    }
    if (graphicsAllowed) placeRegionGraphics(buffer, region.graphics);
  }
}

const compositionRows = new WeakMap<readonly RenderRegion[], ReadonlyMap<number, readonly RenderRegion[]>>();
function compositionRegionsByRow(regions: readonly RenderRegion[]): ReadonlyMap<number, readonly RenderRegion[]> {
  const cached = compositionRows.get(regions);
  if (cached !== undefined) return cached;
  const rows = new Map<number, RenderRegion[]>();
  for (const region of regions) {
    const bounds = region.backdropBounds ?? region.bounds;
    for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
      const entries = rows.get(row) ?? [];
      entries.push(region);
      rows.set(row, entries);
    }
  }
  compositionRows.set(regions, rows);
  return rows;
}

function sameBackdropSurfaces(previous: readonly RenderRegion[], next: readonly RenderRegion[]): boolean {
  const before = previous.filter(region => region.backdropBounds !== undefined);
  const after = next.filter(region => region.backdropBounds !== undefined);
  return before.length === after.length && before.every((region, index) => {
    const other = after[index];
    return region.id === other?.id && region.order === other.order
      && region.zIndex === other.zIndex && region.backdropBounds !== undefined
      && other.backdropBounds !== undefined && sameRect(region.backdropBounds, other.backdropBounds);
  });
}

function compositionDamage(previous: readonly RenderRegion[], next: readonly RenderRegion[]): DirtyRegionSet {
  const damage = new DirtyCoverageAccumulator();
  const oldById = new Map(previous.map(region => [region.id, region]));
  const nextById = new Map(next.map(region => [region.id, region]));
  for (const old of previous) if (!nextById.has(old.id)) damage.add(old.bounds);
  for (const region of next) addRegionDamage(damage, oldById.get(region.id), region);
  return expandWideDamage(damage.toDirtyRegionSet(), previous, next);
}

function addRegionDamage(damage: DirtyCoverageAccumulator, old: RenderRegion | undefined, region: RenderRegion): void {
  if (old === region) return;
  if (old?.order !== region.order || old.zIndex !== region.zIndex
    || old.underlay !== region.underlay || !sameRect(old.bounds, region.bounds)) {
    if (old !== undefined) damage.add(old.bounds);
    damage.add(region.bounds);
    return;
  }
  const rows = new Set([...old.metadata.rowIndexes, ...region.metadata.rowIndexes].map(row => row.row));
  for (const row of rows) addRowDamage(damage, row, snapshotRow(old.metadata, row), snapshotRow(region.metadata, row));
}

function addRowDamage(
  damage: DirtyCoverageAccumulator, row: number, before: FrameSnapshotRowIndex | undefined, after: FrameSnapshotRowIndex | undefined,
): void {
  if (before === after) return;
  for (const column of new Set([...(before?.cells.keys() ?? []), ...(after?.cells.keys() ?? [])])) {
    const left = before?.cells.get(column);
    const right = after?.cells.get(column);
    if (!sameFrameCell(left, right)) damage.addSpan(row, column, Math.max(1, left?.width ?? 1, right?.width ?? 1));
  }
}

const wideRowCells = new WeakMap<FrameSnapshotRowIndex, readonly FrameCell[]>();
function wideCells(row: FrameSnapshotRowIndex | undefined): readonly FrameCell[] {
  if (row === undefined) return [];
  let wide = wideRowCells.get(row);
  if (wide === undefined) { wide = row.renderable.filter(cell => cell.width > 1); wideRowCells.set(row, wide); }
  return wide;
}

function expandWideDamage(
  damage: DirtyRegionSet, previous: readonly RenderRegion[], next: readonly RenderRegion[],
): DirtyRegionSet {
  if (damage.rects.length === 0) return damage;
  const oldRows = compositionRegionsByRow(previous);
  const nextRows = compositionRegionsByRow(next);
  const expanded = new DirtyCoverageAccumulator();
  for (const rect of damage.rects) {
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      const wide = [...(oldRows.get(row) ?? []), ...(nextRows.get(row) ?? [])]
        .flatMap(region => wideCells(snapshotRow(region.metadata, row)));
      let start = rect.column;
      let end = rect.column + rect.width;
      let changed = true;
      while (changed) {
        changed = false;
        for (const cell of wide) {
          if (cell.column >= end || cell.column + cell.width <= start) continue;
          const left = Math.min(start, cell.column);
          const right = Math.max(end, cell.column + cell.width);
          if (left !== start || right !== end) { start = left; end = right; changed = true; }
        }
      }
      expanded.addSpan(row, start, end - start);
    }
  }
  return expanded.toDirtyRegionSet();
}

function recordCellTransfer(instrumentation: RenderInstrumentation | undefined): void {
  instrumentation?.recordWork?.({ kind: 'cell_transfer_calls', count: 1 });
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
  if (target?.hasVisibleGeometry !== true) return undefined;
  return target.cursor ?? { row: target.bounds.row, column: target.bounds.column };
}
