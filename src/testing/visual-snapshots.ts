import { diffFrames, renderFrame } from '../tui/index.ts';
import type { Frame, FrameHitTarget, RenderDiff, RenderSerializeOptions } from '../tui/index.ts';

export interface VisualSnapshotInput {
  readonly frame: Frame;
  readonly previousFrame?: Frame;
  readonly diff?: RenderDiff;
  readonly ansi?: RenderSerializeOptions;
}

export interface VisualSnapshotArtifacts {
  readonly schemaVersion: 'terminal-ui.visual-snapshots.v1';
  readonly plainTextFrame: string;
  readonly ansiFrame: string;
  readonly frameJson: string;
  readonly accessibilityJson: string;
  readonly diffJson: string;
  readonly hitTargetJson: string;
  readonly focusTargetJson: string;
}

export function createVisualSnapshot(input: VisualSnapshotInput): VisualSnapshotArtifacts {
  const frame = normalizeFrame(input.frame);
  const diff = input.diff ?? diffFrames(input.previousFrame, input.frame);
  return {
    schemaVersion: 'terminal-ui.visual-snapshots.v1',
    plainTextFrame: renderFrame(input.frame),
    ansiFrame: normalizeAnsi(renderFrame(input.frame, {
      includeControlSequences: true,
      ...(input.ansi === undefined ? {} : { serialize: input.ansi })
    })),
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
  if (!isRecord(value)) return null;
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => [key, stableValue(entryValue)] as const);
  return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
