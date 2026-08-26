import { resolveTerminalCapabilities } from '../host/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { diffFrames, renderTuiOutput, renderElementFrame } from '../renderer/index.ts';
import type { Element } from '../element/index.ts';
import type { TerminalSize } from '../host/index.ts';
import type { FocusPath } from '../interaction/index.ts';
import type { Frame, FrameHitTarget, RenderDiff, RenderSerializeOptions } from '../renderer/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { TextWidthProfile } from '../text/index.ts';

export interface VisualSnapshotInput {
  readonly frame: Frame;
  readonly previousFrame?: Frame;
  readonly diff?: RenderDiff;
  readonly ansi?: RenderSerializeOptions;
}

export interface VisualSnapshotArtifacts {
  readonly plainTextFrame: string;
  readonly accessibleText: string;
  readonly ansiFrame: string;
  readonly frameJson: string;
  readonly accessibilityJson: string;
  readonly diffJson: string;
  readonly hitTargetJson: string;
  readonly focusTargetJson: string;
}

export interface ElementSnapshotInput {
  readonly element: Element<unknown>;
  readonly terminalSize: TerminalSize;
  readonly previousFrame?: Frame;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly widthProfile?: TextWidthProfile;
  readonly focusPath?: FocusPath;
  readonly ansi?: RenderSerializeOptions;
}

export interface ElementSnapshotResult extends VisualSnapshotArtifacts {
  readonly frame: Frame;
  readonly diff: RenderDiff;
}

export function renderElementSnapshot(input: ElementSnapshotInput): ElementSnapshotResult {
  const frame = renderElementFrame(input.element, input.terminalSize, {
    ...(input.theme === undefined ? {} : { theme: input.theme }),
    ...(input.widthProfile === undefined ? {} : { widthProfile: input.widthProfile }),
    ...(input.focusPath === undefined ? {} : { focusPath: input.focusPath })
  });
  const diff = diffFrames(input.previousFrame, frame);
  return {
    frame,
    diff,
    ...createVisualSnapshot({
      frame,
      diff,
      ...(input.previousFrame === undefined ? {} : { previousFrame: input.previousFrame }),
      ...(input.ansi === undefined ? {} : { ansi: input.ansi })
    })
  };
}

export function createVisualSnapshot(input: VisualSnapshotInput): VisualSnapshotArtifacts {
  const frame = normalizeFrame(input.frame);
  const diff = input.diff ?? diffFrames(input.previousFrame, input.frame);
  const output = renderTuiOutput({ frame: input.frame, ansi: input.ansi ?? defaultAnsiOptions() });
  return {
    plainTextFrame: output.plainTextFrame,
    accessibleText: output.accessibleText,
    ansiFrame: normalizeAnsi(output.ansiFrame ?? ''),
    frameJson: stableJson(frame),
    accessibilityJson: stableJson(input.frame.accessibility),
    diffJson: stableJson(diff),
    hitTargetJson: stableJson(frame.hitTargets ?? []),
    focusTargetJson: stableJson({
      cursor: input.frame.cursor ?? null,
      focusPath: input.frame.focusPath ?? [],
      accessibilityFocusPath: input.frame.accessibility.focusPath
    })
  };
}

function defaultAnsiOptions(): RenderSerializeOptions {
  return {
    capabilities: resolveTerminalCapabilities({
      host: {
        runtime: 'memory',
        inputIsTty: true,
        outputIsTty: true,
        supportsRawInput: true,
        supportsResizeEvents: true,
        supportsTerminalProtocols: true
      }
    })
  };
}

function normalizeFrame(frame: Frame): Frame {
  return {
    ...frame,
    cells: [...frame.cells].sort((left, right) => left.row - right.row || left.column - right.column),
    ...(frame.hitTargets === undefined ? {} : { hitTargets: sortedHitTargets(frame.hitTargets) })
  };
}

function sortedHitTargets(targets: readonly FrameHitTarget[]): readonly FrameHitTarget[] {
  return Object.freeze([...targets].sort((left, right) =>
    (left.zIndex ?? 0) - (right.zIndex ?? 0)
    || left.bounds.row - right.bounds.row
    || left.bounds.column - right.bounds.column
    || left.id.localeCompare(right.id)
  ));
}

function normalizeAnsi(text: string): string {
  return text.split(String.fromCharCode(27)).join('\\x1b');
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2);
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!isNonArrayObject(value)) return null;
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => [key, stableValue(entryValue)] as const);
  return Object.fromEntries(entries);
}
