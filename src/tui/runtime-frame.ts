import { toAccessibleSnapshot, validateAccessibleSnapshot } from '../accessibility/index.ts';
import { defineTheme, isTerminalTheme } from '../theme/index.ts';
import { dirtyRegionsForRegionChanges } from './dirty-regions.ts';
import { diffFrames, renderDiffAnsi, renderWidgetFrameProjection } from './render.ts';
import { recordTuiFrame } from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost, TerminalViewport } from '../host/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, RenderDiff } from './frame.ts';
import type { LayoutNode } from './layout.ts';
import type { RenderRegion } from './render.ts';
import type { TuiApp, TuiContext, TuiRuntimeOptions, TuiTheme } from './types.ts';

export interface RenderCommitCandidate<TMessage> {
  readonly stateVersion: number;
  readonly themeFingerprint: string;
  readonly viewport: TerminalViewport;
  readonly widget: Widget<TMessage>;
  readonly layout: LayoutNode;
  readonly regions: readonly RenderRegion<TMessage>[];
  readonly frame: Frame;
  readonly theme: TerminalTheme;
}

export function renderCurrentFrame<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  context: TuiContext<TMessage>,
  focusPath: FocusPath | undefined,
  options: TuiRuntimeOptions<TState, TMessage>,
  stateVersion: number
): RenderCommitCandidate<TMessage> {
  const theme = resolveTuiTheme(options.theme, state);
  const projection = renderWidgetFrameProjection(app.definition.view(state, context), context.viewport, {
    ...(focusPath === undefined ? {} : { focusPath }),
    theme
  });
  const accessibility = appAccessibility(app, state, projection.frame);
  const frame = accessibility === projection.frame.accessibility ? projection.frame : { ...projection.frame, accessibility };
  return {
    stateVersion,
    themeFingerprint: theme.fingerprint,
    viewport: context.viewport,
    widget: projection.widget,
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
  options: { readonly dirtyRegions?: DirtyRegionSet } = {}
): Promise<RenderDiff> {
  const diff = diffFrames(previousFrame, frame, options);
  const capabilities = await host.getCapabilities();
  recordHostFrame(host, frame, diff);
  recordTuiFrame(transcript, frame, diff);
  await host.write({ text: renderDiffAnsi(diff, { capabilities, hyperlinks: true, theme }) });
  return diff;
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

export function setHostViewport(host: TerminalHost, viewport: TerminalViewport): void {
  const resizable = host as TerminalHost & { setViewport?: (viewport: TerminalViewport) => void };
  resizable.setViewport?.(viewport);
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
  const recorder = host as TerminalHost & {
    recordFrame?: (frame: Frame) => void;
    recordDiff?: (diff: RenderDiff) => void;
  };
  recorder.recordFrame?.(frame);
  recorder.recordDiff?.(diff);
}
