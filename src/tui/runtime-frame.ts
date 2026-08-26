import type { RenderNode } from '../renderer/internal/render-tree/index.ts';
import { defaultTheme } from '../theme/index.ts';
import { resolveThemeInput } from '../theme/theme.ts';
import { dirtyRegionsForRegionChanges } from '../renderer/internal/dirty-regions.ts';
import { withFrameAccessibility } from '../renderer/internal/frame-snapshot.ts';
import { diffFrames } from '../renderer/frame.ts';
import { renderElementInternal, rerenderElementInternal } from '../renderer/internal/render-element.ts';
import { planTerminalFrameOutput } from '../renderer/internal/terminal-frame-planner.ts';
import { defaultTuiLifecyclePolicy } from './run-configuration.ts';
import {
  requireCommittedTerminalWrite,
  terminalWriteMayHaveCommitted
} from '../host/write-receipt.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type {
  TerminalCapabilityProfile,
  TerminalHost,
  TerminalOperationContext,
  TerminalSize
} from '../host/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TerminalGraphicsCommitter } from './graphics-committer.ts';
import type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { PointerVisualSnapshot } from '../interaction/pointer-interaction.ts';
import type { Frame, RenderDiff } from '../renderer/frame.ts';
import type { LayoutNode, Rect } from '../renderer/contracts.ts';
import type { RenderRegion } from '../renderer/internal/render-regions.ts';
import type { RenderBudgetLimits } from '../renderer/render-budget.ts';
import type { GraphicsBudgetLimits } from '../graphics/index.ts';
import type { TuiApp, TuiContext, TuiTheme } from './types.ts';
import { tuiDefinition } from './definition.ts';

export interface RenderCommitCandidate<TMessage> {
  readonly commitId: string;
  readonly stateVersion: number;
  readonly terminalSize: TerminalSize;
  readonly widthProfile: RenderCommitCandidate<TMessage>['frame']['widthProfile'];
  readonly node: RenderNode<TMessage>;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly postCompositionDamage: DirtyRegionSet;
  readonly frame: Frame;
  readonly theme: TerminalTheme;
  readonly limits: RenderBudgetLimits;
  readonly graphicsBudget: GraphicsBudgetLimits;
}

export function renderCurrentFrame<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  context: TuiContext,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  stateVersion: number,
  commitId: string,
  graphicsBudget?: Partial<GraphicsBudgetLimits>,
  pointerVisuals?: PointerVisualSnapshot,
): RenderCommitCandidate<TMessage> {
  const renderResult = renderElementInternal(tuiDefinition(app).view(state, context), context.terminalSize, {
    ...(focusPath === undefined ? {} : { focusPath }),
    theme,
    widthProfile: context.capabilities.unicode.widthProfile,
    ...(graphicsBudget === undefined ? {} : { graphicsBudget }),
    ...(pointerVisuals === undefined ? {} : { pointerVisuals }),
  });
  return candidateFromRenderResult(app, state, renderResult, stateVersion, commitId);
}

export function rerenderCurrentFrame<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  candidate: RenderCommitCandidate<TMessage>,
  focusPath: FocusPath | undefined,
  stateVersion: number,
  commitId: string,
  pointerVisuals?: PointerVisualSnapshot,
): RenderCommitCandidate<TMessage> {
  const renderResult = rerenderElementInternal<TMessage>(candidate, {
    ...(focusPath === undefined ? {} : { focusPath }),
    ...(pointerVisuals === undefined ? {} : { pointerVisuals }),
  });
  return candidateFromRenderResult<TState, TMessage>(app, state, renderResult, stateVersion, commitId);
}

function candidateFromRenderResult<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  renderResult: ReturnType<typeof renderElementInternal<TMessage>>,
  stateVersion: number,
  commitId: string,
): RenderCommitCandidate<TMessage> {
  const accessibility = appAccessibility(app, state, renderResult.frame);
  const frame = withFrameAccessibility(renderResult.frame, accessibility);
  return {
    commitId,
    stateVersion,
    terminalSize: renderResult.terminalSize,
    widthProfile: renderResult.widthProfile,
    node: renderResult.node,
    layout: renderResult.layout,
    regions: renderResult.regions,
    postCompositionDamage: renderResult.postCompositionDamage,
    frame,
    theme: renderResult.theme,
    limits: renderResult.limits,
    graphicsBudget: renderResult.graphicsBudget,
  };
}

export async function commitFrame(
  host: TerminalHost,
  previousFrame: Frame | undefined,
  frame: Frame,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile,
  options: {
    readonly dirtyRegions?: readonly Rect[];
    readonly signal?: AbortSignal;
    readonly graphics?: TerminalGraphicsCommitter;
  } = {}
): Promise<RenderDiff> {
  options.signal?.throwIfAborted();
  let diff = diffFrames(previousFrame, frame, options);
  const graphics = options.graphics?.plan(frame, diff, capabilities, theme);
  if (options.signal?.aborted === true) {
    options.graphics?.invalidate();
    options.signal.throwIfAborted();
  }
  if (graphics?.forceFullRewrite === true && !diff.fullRewrite) {
    diff = diffFrames(undefined, frame, options);
  }
  options.signal?.throwIfAborted();
  const output = planTerminalFrameOutput(previousFrame, frame, diff, {
    capabilities,
    scrollRegion: capabilities.scrollRegion.support === 'supported'
      && capabilities.scrollRegion.availability === 'available',
    hyperlinks: true,
    theme,
    ...(graphics?.beforeCells === undefined ? {} : { beforeText: graphics.beforeCells }),
    ...(graphics?.afterCells === undefined ? {} : { afterText: graphics.afterCells })
  });
  const operationContext: TerminalOperationContext = options.signal === undefined
    ? {}
    : { signal: options.signal };
  if (output.text.length > 0) {
    try {
      requireCommittedTerminalWrite(await host.write({ text: output.text }, operationContext));
    } catch (error) {
      options.graphics?.invalidate();
      await attemptOutputCleanup(host, output.failureCleanup, error);
    }
  }
  return diff;
}

async function attemptOutputCleanup(
  host: TerminalHost,
  cleanup: string | undefined,
  writeError: unknown
): Promise<never> {
  if (!terminalWriteMayHaveCommitted(writeError)) throw writeError;
  if (cleanup === undefined) throw writeError;
  const controller = new AbortController();
  const timer = Promise.resolve()
    .then(() => host.clock.sleep(defaultTuiLifecyclePolicy.runtimeDisposalTimeoutMs, controller.signal))
    .then((outcome) => {
      if (outcome === 'elapsed') controller.abort(new Error('Terminal output cleanup timed out.'));
    }, (cause: unknown) => {
      if (!controller.signal.aborted) controller.abort(cause);
    });
  try {
    requireCommittedTerminalWrite(await host.writeRecovery({ text: cleanup }, { signal: controller.signal }));
  } catch (cleanupError) {
    throw new AggregateError(
      [writeError, cleanupError],
      'Terminal frame write failed and terminal-state cleanup also failed.',
      { cause: cleanupError }
    );
  } finally {
    controller.abort('terminal_output_cleanup_settled');
    void timer;
  }
  throw writeError;
}

export function dirtyRegionsForRenderCommit(
  previous: RenderCommitCandidate<unknown> | undefined,
  next: RenderCommitCandidate<unknown>
): DirtyRegionSet | undefined {
  const regionDamage = dirtyRegionsForRegionChanges(previous?.regions, next.regions);
  if (regionDamage === undefined || previous === undefined) return undefined;
  return regionDamage
    .union(previous.postCompositionDamage)
    .union(next.postCompositionDamage);
}

export function resolveTuiTheme<TState>(theme: TuiTheme<TState> | undefined, state: TState): TerminalTheme {
  const resolved = typeof theme === 'function' ? theme(state) : theme;
  if (resolved === undefined) return defaultTheme;
  return resolveThemeInput(resolved, defaultTheme);
}

function appAccessibility<TState, TMessage>(
  _app: TuiApp<TState, TMessage>,
  _state: TState,
  frame: Frame
): AccessibleSnapshot {
  return Object.freeze({
    ...frame.accessibility,
    source: 'tui' as const
  });
}
