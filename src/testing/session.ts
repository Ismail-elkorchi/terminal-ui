import type { AccessibleSnapshot } from '../accessibility/types.ts';
import type { TerminalHost } from '../host/types.ts';
import type {
  Frame,
  FrameDescriptor,
  RenderDiff,
  RenderDiffDescriptor,
} from '../renderer/contracts.ts';
import { createTranscriptRecorder } from '../transcript/recorder.ts';
import type { TranscriptRuntimeCommit } from '../transcript/types.ts';
import { createTuiRuntime } from '../tui/runtime.ts';
import type { TuiApp, TuiRuntime } from '../tui/types.ts';
import { latestRecordedSnapshot, recordedHarnessCommit } from './recording.ts';

/** Owns one attached app, its commit waiters, and captured frame evidence. */
export function createHarnessSession(identity: { readonly id: string; readonly label: string; readonly commitPrefix: string }) {
  const transcript = createTranscriptRecorder({ source: 'test' });
  const frames: FrameDescriptor[] = [];
  const diffs: RenderDiffDescriptor[] = [];
  let pendingFrame: Frame | undefined;
  let commitSequence = 1;
  let activeRuntime: TuiRuntime<unknown, unknown> | undefined;
  const waiters: { readonly resolve: (frame: Frame) => void; readonly reject: (cause: Error) => void }[] = [];

  return {
    transcript,
    runtime: () => activeRuntime,
    frames: () => [...frames],
    diffs: () => [...diffs],
    recordFrame: (frame: unknown): void => {
      pendingFrame = frame as Frame;
      frames.push(pendingFrame);
    },
    recordDiff: (diff: unknown): void => {
      const typedDiff = diff as RenderDiff;
      diffs.push(typedDiff);
      if (pendingFrame !== undefined && activeRuntime === undefined) {
        transcript.record({ kind: 'commit', commit: recordedHarnessCommit(
          `${identity.commitPrefix}:commit:${String(commitSequence)}`, commitSequence - 1, pendingFrame, typedDiff,
        ) });
        commitSequence += 1;
      }
      if (pendingFrame !== undefined && activeRuntime !== undefined) {
        for (const waiter of waiters.splice(0)) waiter.resolve(pendingFrame);
      }
      pendingFrame = undefined;
    },
    recordCommit: (commit: TranscriptRuntimeCommit): void => {
      frames.push(commit.frame);
      diffs.push(commit.diff);
      transcript.record({ kind: 'commit', commit });
    },
    nextCommit: (): Promise<Frame> => {
      if (activeRuntime === undefined) throw new Error('nextCommit requires an attached TUI app.');
      return new Promise((resolve, reject) => { waiters.push({ resolve, reject }); });
    },
    async runApp<TState, TMessage, TResult>(
      host: TerminalHost,
      app: TuiApp<TState, TMessage>,
      operation: (runtime: TuiRuntime<TState, TMessage>) => Promise<TResult>,
    ): Promise<TResult> {
      if (activeRuntime !== undefined) throw new Error('A TUI runtime is already attached to this harness.');
      const runtime = createTuiRuntime({ app, host, transcript });
      activeRuntime = runtime;
      try {
        await runtime.start();
        return await operation(runtime);
      } finally {
        try {
          await runtime.dispose();
        } finally {
          for (const waiter of waiters.splice(0)) waiter.reject(new Error('TUI app exited before the expected commit.'));
          activeRuntime = undefined;
        }
      }
    },
    snapshot: (): AccessibleSnapshot => {
      return latestRecordedSnapshot(transcript.snapshot().steps, frames, { source: 'test_harness', id: identity.id, label: identity.label });
    },
  };
}
