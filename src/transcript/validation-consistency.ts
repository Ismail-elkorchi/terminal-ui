import {
  applyRenderDiff,
  replayedFrameMatches,
} from '../renderer/internal/diff-interpreter.ts';
import type { ReplayedFrame } from '../renderer/internal/diff-interpreter.ts';
import type { InteractionTranscriptStep } from './types.ts';

export function transcriptConsistencyIssue(
  steps: readonly InteractionTranscriptStep[],
): string | undefined {
  const commitIds = new Set<string>();
  let lastStateVersion = -1;
  let restorationSeen = false;
  let previousFrame: ReplayedFrame | undefined;
  for (const [index, step] of steps.entries()) {
    if (step.kind === 'restore' && step.phase === 'shutdown') {
      restorationSeen = true;
      continue;
    }
    if (restorationSeen && transitionAfterRestoration(step)) {
      return `Transcript ${step.kind} step at index ${String(index)} occurs after shutdown restoration.`;
    }
    if (step.kind !== 'commit') continue;
    const commitIssue = commitConsistencyIssue(
      step.commit,
      index,
      commitIds,
      lastStateVersion,
      previousFrame,
    );
    if (typeof commitIssue === 'string') return commitIssue;
    lastStateVersion = step.commit.stateVersion;
    previousFrame = commitIssue;
  }
  return undefined;
}

function transitionAfterRestoration(step: InteractionTranscriptStep): boolean {
  return step.kind === 'commit' || step.kind === 'input' || step.kind === 'message';
}

function commitConsistencyIssue(
  commit: Extract<InteractionTranscriptStep, { readonly kind: 'commit' }>['commit'],
  index: number,
  commitIds: Set<string>,
  lastStateVersion: number,
  previousFrame: ReplayedFrame | undefined,
): ReplayedFrame | string {
  const { id, stateVersion, frame, diff } = commit;
  if (commitIds.has(id)) return `Transcript commit id ${id} is duplicated.`;
  commitIds.add(id);
  if (stateVersion < lastStateVersion) {
    return `Transcript commit stateVersion decreases at index ${String(index)}.`;
  }
  if (previousFrame === undefined && !diff.fullRewrite) {
    return `Transcript first commit at index ${String(index)} must contain a full rewrite.`;
  }
  try {
    const replayed = applyRenderDiff(previousFrame, diff);
    return replayedFrameMatches(replayed, frame)
      ? replayed
      : `Transcript commit at index ${String(index)} diff does not reproduce its frame.`;
  } catch (cause) {
    return `Transcript commit at index ${String(index)} diff chain is invalid: ${errorMessage(cause)}.`;
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
