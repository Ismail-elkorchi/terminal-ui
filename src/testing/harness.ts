import { createMemoryTerminalHost } from '../host/index.ts';
import { decodeInputChunk, decodeInputEvent } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import { latestRecordedSnapshot, recordedHarnessCommit } from './recording.ts';
import { createTuiRuntime } from '../tui/runtime.ts';
import type { TuiRuntime } from '../tui/types.ts';
import type { MemoryTerminalHost } from '../host/index.ts';
import type { RecordedInputEvent } from '../input/index.ts';
import type { Frame, FrameDescriptor, RenderDiff, RenderDiffDescriptor } from '../renderer/index.ts';
import type { TerminalHarness, TerminalHarnessOptions } from './types.ts';

export function createTerminalHarness(options: TerminalHarnessOptions = {}): TerminalHarness {
  const transcript = createTranscriptRecorder({ source: 'test' });
  const frames: FrameDescriptor[] = [];
  const diffs: RenderDiffDescriptor[] = [];
  let pendingFrame: Frame | undefined;
  let commitSequence = 1;
  let replayRestorePhase: 'checkpoint' | 'shutdown' | undefined;
  let activeRuntime: TuiRuntime<unknown, unknown> | undefined;
  const commitWaiters: { readonly resolve: (frame: Frame) => void; readonly reject: (cause: Error) => void }[] = [];
  const host = createMemoryTerminalHost({
    ...(options.terminalSize === undefined ? {} : { terminalSize: options.terminalSize }),
    observer: {
      recordFrame(frame) {
        pendingFrame = frame as Frame;
        frames.push(pendingFrame);
      },
      recordDiff(diff) {
        const typedDiff = diff as RenderDiff;
        diffs.push(typedDiff);
        if (pendingFrame !== undefined && activeRuntime === undefined) {
          transcript.record({
            kind: 'commit',
            commit: recordedHarnessCommit(`harness:commit:${String(commitSequence)}`, commitSequence - 1, pendingFrame, typedDiff)
          });
          commitSequence += 1;
        }
        if (pendingFrame !== undefined && activeRuntime !== undefined) {
          for (const waiter of commitWaiters.splice(0)) waiter.resolve(pendingFrame);
        }
        pendingFrame = undefined;
      },
      recordRestore(checkpoint) {
        transcript.record({
          kind: 'restore',
          phase: replayRestorePhase ?? 'checkpoint',
          result: checkpoint
        });
      }
    }
  });
  return {
    host,
    clock: host.clock,
    transcript,
    input(event) {
      if (typeof event === 'string') {
        const runtime = activeRuntime;
        if (runtime !== undefined) {
          return runtime.handleInputChunk({ data: event })
            .then(() => runtime.flushInput()).then(() => undefined);
        }
        host.input(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      const admitted = decodeInputEvent(event);
      const runtime = activeRuntime;
      if (runtime !== undefined) {
        if (admitted.kind === 'resize') {
          return runtime.resize(admitted.terminalSize).then(() => undefined);
        }
        if (admitted.kind === 'signal' || admitted.kind === 'end') {
          throw new TypeError(`An attached TUI runtime cannot receive ${admitted.kind} as a semantic input event.`);
        }
        return runtime.handleInput(admitted)
          .then(() => runtime.flushInput()).then(() => undefined);
      }
      deliverHarnessInputEvent(host, admitted);
      transcript.record({ kind: 'input', event: admitted });
      return Promise.resolve();
    },
    resize(terminalSize) {
      const admitted = decodeInputEvent({ kind: 'resize', terminalSize });
      if (admitted.kind !== 'resize') throw new Error('Expected a decoded resize event.');
      if (activeRuntime !== undefined) return activeRuntime.resize(admitted.terminalSize).then(() => undefined);
      deliverHarnessResize(host, admitted.terminalSize);
      transcript.record({ kind: 'input', event: admitted });
      return Promise.resolve();
    },
    nextCommit() {
      if (activeRuntime === undefined) throw new Error('nextCommit requires an attached TUI app.');
      return new Promise<Frame>((resolve, reject) => { commitWaiters.push({ resolve, reject }); });
    },
    async run(operation) {
      return operation(host);
    },
    async runApp(app, operation) {
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
          for (const waiter of commitWaiters.splice(0)) {
            waiter.reject(new Error('TUI app exited before the expected commit.'));
          }
          activeRuntime = undefined;
        }
      }
    },
    snapshot() {
      return latestRecordedSnapshot(transcript.snapshot().steps, frames, {
        source: 'test_harness', id: 'terminal-harness', label: 'Terminal harness',
      });
    },
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => host.restores(),
    recordCommit(commit) {
      frames.push(commit.frame);
      diffs.push(commit.diff);
      transcript.record({ kind: 'commit', commit });
    },
    recordRestore(result, phase) {
      replayRestorePhase = phase;
      try {
        host.observer?.recordRestore?.(result);
      } finally {
        replayRestorePhase = undefined;
      }
    },
    output: () => host.output()
  };
}

function deliverHarnessInputEvent(host: MemoryTerminalHost, event: RecordedInputEvent): void {
  if (event.kind === 'resize') {
    deliverHarnessResize(host, event.terminalSize);
    return;
  }
  if (event.kind === 'signal') {
    host.signals.emit(event.signal);
    return;
  }
  if (event.kind === 'end') {
    host.endInput();
    return;
  }
  const encoded = encodeHarnessInputEvent(event);
  host.input(encoded);
}

function deliverHarnessResize(host: MemoryTerminalHost, terminalSize: { readonly columns: number; readonly rows: number }): void {
  void host.terminalSizeControl?.setTerminalSize(terminalSize);
  host.signals.emit('resize');
}
