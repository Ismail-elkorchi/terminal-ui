import { createAccessibleSnapshot } from '../accessibility/snapshot.ts';
import type { AccessibleSnapshot } from '../accessibility/types.ts';
import type { Frame, FrameDescriptor, RenderDiff } from '../renderer/contracts.ts';
import type { InteractionTranscriptStep, TranscriptRuntimeCommit } from '../transcript/types.ts';

export function latestRecordedSnapshot(
  steps: readonly InteractionTranscriptStep[],
  frames: readonly FrameDescriptor[],
  fallback: { readonly source: 'test_harness'; readonly id: string; readonly label: string },
): AccessibleSnapshot {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === 'snapshot') return step.snapshot;
    if (step?.kind === 'commit') return step.commit.frame.accessibility;
  }
  const frame = frames.at(-1);
  if (frame !== undefined) return frame.accessibility;
  return createAccessibleSnapshot({
    source: fallback.source,
    root: { id: fallback.id, role: 'group', label: fallback.label },
  });
}

export function recordedHarnessCommit(
  id: string,
  stateVersion: number,
  frame: Frame,
  diff: RenderDiff,
): TranscriptRuntimeCommit {
  return {
    id,
    stateVersion,
    terminalSize: { columns: frame.width, rows: frame.height },
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    frame,
    diff,
  };
}
