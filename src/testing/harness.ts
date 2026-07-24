import { toAccessibleSnapshot as createAccessibleSnapshot } from '../accessibility/index.ts';
import { createMemoryTerminalHost } from '../host/index.ts';
import { decodeInputChunk } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { MemoryTerminalHost, TerminalSignal } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { InteractionTranscriptStep, TranscriptRuntimeCommit } from '../transcript/index.ts';
import type { TerminalHarness, TerminalHarnessOptions } from './types.ts';

export function createTerminalHarness(options: TerminalHarnessOptions = {}): TerminalHarness {
  const transcript = createTranscriptRecorder({ source: 'test' });
  const frames: Frame[] = [];
  const diffs: RenderDiff[] = [];
  let pendingFrame: Frame | undefined;
  let commitSequence = 1;
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
        if (pendingFrame !== undefined) {
          transcript.record({
            kind: 'commit',
            commit: harnessCommit(`harness:commit:${String(commitSequence)}`, commitSequence - 1, pendingFrame, typedDiff)
          });
          commitSequence += 1;
          pendingFrame = undefined;
        }
      },
      recordRestore(checkpoint) {
        transcript.record({ kind: 'restore', result: checkpoint });
      }
    }
  });
  return {
    host,
    clock: host.clock,
    transcript,
    input(event) {
      if (typeof event === 'string') {
        host.input(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      deliverHarnessInputEvent(host, event);
      transcript.record({ kind: 'input', event });
      return Promise.resolve();
    },
    resize(terminalSize) {
      deliverHarnessResize(host, terminalSize);
      transcript.record({
        kind: 'input',
        event: { kind: 'resize', terminalSize }
      });
      return Promise.resolve();
    },
    async run(operation) {
      return operation(host);
    },
    snapshot() {
      return latestHarnessSnapshot(transcript.snapshot().steps, frames);
    },
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => host.restores(),
    recordCommit(commit) {
      frames.push(commit.frame);
      diffs.push(commit.diff);
      transcript.record({ kind: 'commit', commit });
    },
    recordRestore: (result) => { host.observer?.recordRestore?.(result); },
    output: () => host.output()
  };
}

function deliverHarnessInputEvent(host: MemoryTerminalHost, event: InputEvent): void {
  if (event.kind === 'resize') {
    deliverHarnessResize(host, event.terminalSize);
    return;
  }
  if (event.kind === 'signal') {
    if (isTerminalSignal(event.signal)) host.signals.emit(event.signal);
    return;
  }
  if (event.kind === 'end') {
    host.endInput();
    return;
  }
  const encoded = encodeHarnessInputEvent(event);
  if (encoded !== undefined) host.input(encoded);
}

function deliverHarnessResize(host: MemoryTerminalHost, terminalSize: { readonly columns: number; readonly rows: number }): void {
  void host.terminalSizeControl?.setTerminalSize(terminalSize);
  host.signals.emit('resize');
}

function isTerminalSignal(signal: string): signal is TerminalSignal {
  return signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGHUP' || signal === 'resize';
}

export function toAccessibleSnapshotFromHarness(harness: TerminalHarness): AccessibleSnapshot {
  return harness.snapshot();
}

function latestHarnessSnapshot(
  steps: readonly InteractionTranscriptStep[],
  frames: readonly Frame[]
): AccessibleSnapshot {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === 'snapshot') return step.snapshot;
    if (step?.kind === 'commit') return step.commit.frame.accessibility;
  }
  const lastFrame = frames.at(-1);
  if (lastFrame !== undefined) return lastFrame.accessibility;
  return createAccessibleSnapshot({
    source: 'test_harness',
    root: { id: 'terminal-harness', role: 'group', label: 'Terminal harness' }
  });
}

function harnessCommit(id: string, stateVersion: number, frame: Frame, diff: RenderDiff): TranscriptRuntimeCommit {
  return {
    id,
    stateVersion,
    terminalSize: { columns: frame.width, rows: frame.height },
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    frame,
    diff
  };
}
