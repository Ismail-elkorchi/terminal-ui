import { toAccessibleSnapshot, validateAccessibleSnapshot } from '../accessibility/index.ts';
import { diffFrames, renderDiffAnsi, renderWidgetFrame } from './render.ts';
import { recordTuiFrame } from './transcript.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalHost, TerminalViewport } from '../host/index.ts';
import type { FocusPath } from './focus.ts';
import type { Frame, RenderDiff } from './frame.ts';
import type { TuiApp, TuiContext, TuiRuntimeOptions } from './types.ts';

export function renderCurrentFrame<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  state: TState,
  context: TuiContext<TMessage>,
  focusPath: FocusPath | undefined,
  options: TuiRuntimeOptions<TState, TMessage>
): Frame {
  const frame = renderWidgetFrame(app.definition.view(state, context), context.viewport, {
    ...(focusPath === undefined ? {} : { focusPath }),
    ...(options.theme === undefined ? {} : { theme: options.theme })
  });
  const accessibility = appAccessibility(app, state, frame);
  return accessibility === frame.accessibility ? frame : { ...frame, accessibility };
}

export async function commitFrame(
  host: TerminalHost,
  previousFrame: Frame | undefined,
  frame: Frame,
  transcript: TuiRuntimeOptions<unknown, unknown>['transcript'] | undefined,
  theme: TuiRuntimeOptions<unknown, unknown>['theme'] | undefined
): Promise<RenderDiff> {
  const diff = diffFrames(previousFrame, frame);
  const capabilities = await host.getCapabilities();
  recordHostFrame(host, frame, diff);
  recordTuiFrame(transcript, frame, diff);
  await host.write({ text: renderDiffAnsi(diff, { capabilities, hyperlinks: true, ...(theme === undefined ? {} : { theme }) }) });
  return diff;
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
