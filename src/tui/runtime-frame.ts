import { toAccessibleSnapshot, validateAccessibleSnapshot } from '../accessibility/index.ts';
import type { RenderNode } from '../renderer/model/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme } from '../theme/index.ts';
import { dirtyRegionsForRegionChanges } from '../renderer/internal/dirty-regions.ts';
import { diffFrames, renderElementInternal } from '../renderer/internal/render.ts';
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
import type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { Frame, RenderDiff } from '../renderer/internal/frame.ts';
import type { LayoutNode } from '../renderer/contracts.ts';
import type { RenderRegion } from '../renderer/internal/render.ts';
import type { TuiApp, TuiContext, TuiTheme } from './types.ts';

export interface RenderCommitCandidate<TMessage> {
  readonly commitId: string;
  readonly stateVersion: number;
  readonly themeFingerprint: string;
  readonly terminalSize: TerminalSize;
  readonly node: RenderNode<TMessage>;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly frame: Frame;
  readonly theme: TerminalTheme;
}

export function renderCurrentFrame<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  context: TuiContext,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  stateVersion: number,
  commitId: string
): RenderCommitCandidate<TMessage> {
  const renderResult = renderElementInternal(app.definition.view(state, context), context.terminalSize, {
    ...(focusPath === undefined ? {} : { focusPath }),
    theme,
    widthProfile: context.capabilities.unicode.widthProfile
  });
  const accessibility = appAccessibility(app, state, renderResult.frame);
  const frame = accessibility === renderResult.frame.accessibility
    ? renderResult.frame
    : { ...renderResult.frame, accessibility };
  return {
    commitId,
    stateVersion,
    themeFingerprint: theme.fingerprint,
    terminalSize: context.terminalSize,
    node: renderResult.node,
    layout: renderResult.layout,
    regions: renderResult.regions,
    frame,
    theme
  };
}

export async function commitFrame(
  host: TerminalHost,
  previousFrame: Frame | undefined,
  frame: Frame,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile,
  options: { readonly dirtyRegions?: DirtyRegionSet; readonly signal?: AbortSignal } = {}
): Promise<RenderDiff> {
  options.signal?.throwIfAborted();
  const diff = diffFrames(previousFrame, frame, options);
  options.signal?.throwIfAborted();
  const output = planTerminalFrameOutput(previousFrame, frame, diff, {
    capabilities,
    scrollRegion: capabilities.scrollRegion.support === 'supported'
      && capabilities.scrollRegion.availability === 'available',
    hyperlinks: true,
    theme
  });
  const operationContext: TerminalOperationContext = options.signal === undefined
    ? {}
    : { signal: options.signal };
  if (output.text.length > 0) {
    try {
      requireCommittedTerminalWrite(await host.write({ text: output.text }, operationContext));
    } catch (error) {
      await attemptOutputCleanup(host, output.failureCleanup, error);
    }
  }
  options.signal?.throwIfAborted();
  recordHostFrame(host, frame, diff);
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
    .then(() => {
      if (!controller.signal.aborted) controller.abort(new Error('Terminal output cleanup timed out.'));
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
  return dirtyRegionsForRegionChanges(previous?.regions, next.regions);
}

export function resolveTuiTheme<TState>(theme: TuiTheme<TState> | undefined, state: TState): TerminalTheme {
  const resolved = typeof theme === 'function' ? theme(state) : theme;
  if (resolved === undefined) return defaultTheme;
  return isTerminalTheme(resolved) ? resolved : defineTheme(resolved);
}

function appAccessibility<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  frame: Frame
): AccessibleSnapshot {
  const tuiAccessibility = toAccessibleSnapshot({
    ...frame.accessibility,
    source: 'tui'
  });
  const described = app.definition.accessibility?.describe?.(state);
  if (described === undefined) return tuiAccessibility;
  const normalized = toAccessibleSnapshot({
    ...described,
    source: 'tui'
  });
  const valid = validateAccessibleSnapshot(normalized);
  if (valid.ok) return normalized;
  return toAccessibleSnapshot({
    ...tuiAccessibility,
    diagnostics: [...tuiAccessibility.diagnostics, valid.error]
  });
}

function recordHostFrame(host: TerminalHost, frame: Frame, diff: RenderDiff): void {
  host.observer?.recordFrame?.(frame);
  host.observer?.recordDiff?.(diff);
}
