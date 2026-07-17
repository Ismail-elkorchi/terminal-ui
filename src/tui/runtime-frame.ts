import { toAccessibleSnapshot, validateAccessibleSnapshot } from '../accessibility/index.ts';
import type { RenderNode } from '../renderer/model/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import { dirtyRegionsForRegionChanges } from '../renderer/internal/dirty-regions.ts';
import { diffFrames, renderElementProjection } from '../renderer/internal/render.ts';
import { planTerminalOutput } from '../renderer/internal/output-planner.ts';
import { recordTuiFrame } from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost, TerminalViewport } from '../host/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { DirtyRegionSet } from '../renderer/internal/dirty-regions.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { Frame, RenderDiff } from '../renderer/internal/frame.ts';
import type { LayoutNode } from '../renderer/internal/layout.ts';
import type { RenderRegion } from '../renderer/internal/render.ts';
import type { TuiApp, TuiContext, TuiRuntimeOptions, TuiTheme } from './types.ts';

export interface RenderCommitCandidate<TMessage> {
  readonly stateVersion: number;
  readonly themeFingerprint: string;
  readonly viewport: TerminalViewport;
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
  options: TuiRuntimeOptions<TState, TMessage>,
  stateVersion: number
): RenderCommitCandidate<TMessage> {
  const theme = resolveTuiTheme(options.theme, state);
  const projection = renderElementProjection(app.definition.view(state, context), context.viewport, {
    ...(focusPath === undefined ? {} : { focusPath }),
    theme
  });
  const accessibility = appAccessibility(app, state, projection.frame);
  const frame = accessibility === projection.frame.accessibility ? projection.frame : { ...projection.frame, accessibility };
  return {
    stateVersion,
    themeFingerprint: theme.fingerprint,
    viewport: context.viewport,
    node: projection.node,
    layout: projection.layout,
    regions: projection.regions,
    frame,
    theme
  };
}

export async function commitFrame(
  host: TerminalHost,
  previousFrame: Frame | undefined,
  frame: Frame,
  transcript: TuiRuntimeOptions<unknown, unknown>['transcript'] | undefined,
  theme: TerminalTheme,
  options: { readonly dirtyRegions?: DirtyRegionSet; readonly signal?: AbortSignal } = {}
): Promise<RenderDiff> {
  options.signal?.throwIfAborted();
  const diff = diffFrames(previousFrame, frame, options);
  const capabilities = await host.getCapabilities();
  options.signal?.throwIfAborted();
  const output = planTerminalOutput(diff, { capabilities, hyperlinks: true, theme });
  try {
    await host.write({ text: output.text });
  } catch (error) {
    await attemptOutputCleanup(host, output.failureCleanup, error);
  }
  options.signal?.throwIfAborted();
  recordHostFrame(host, frame, diff);
  recordTuiFrame(transcript, frame, diff);
  return diff;
}

async function attemptOutputCleanup(
  host: TerminalHost,
  cleanup: string | undefined,
  writeError: unknown
): Promise<never> {
  if (cleanup === undefined) throw writeError;
  try {
    await host.write({ text: cleanup });
  } catch (cleanupError) {
    throw new AggregateError(
      [writeError, cleanupError],
      'Terminal frame write failed and synchronized-output cleanup also failed.',
      { cause: cleanupError }
    );
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
  if (resolved === undefined) return defineTheme();
  return isTerminalTheme(resolved) ? resolved : defineTheme(resolved);
}

function appAccessibility<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  frame: Frame
): AccessibleSnapshot {
  const described = app.definition.accessibility?.describe?.(state);
  if (described === undefined) return frame.accessibility;
  const normalized = toAccessibleSnapshot(described);
  const valid = validateAccessibleSnapshot(normalized);
  if (valid.ok) return normalized;
  return toAccessibleSnapshot({
    ...frame.accessibility,
    diagnostics: [...frame.accessibility.diagnostics, valid.error]
  });
}

function recordHostFrame(host: TerminalHost, frame: Frame, diff: RenderDiff): void {
  host.observer?.recordFrame?.(frame);
  host.observer?.recordDiff?.(diff);
}
