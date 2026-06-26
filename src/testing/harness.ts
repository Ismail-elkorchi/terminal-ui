import { toAccessibleSnapshot as createAccessibleSnapshot } from '../accessibility/index.ts';
import { createMemoryTerminalHost } from '../host/index.ts';
import { decodeInputChunk } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { MemoryTerminalHost, TerminalSignal } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../tui/index.ts';
import type { InteractionTranscriptStep } from '../transcript/index.ts';
import type { TerminalHarness, TerminalHarnessOptions } from './types.ts';

export function createTerminalHarness(options: TerminalHarnessOptions = {}): TerminalHarness {
  const host = createMemoryTerminalHost(options.viewport === undefined ? {} : { viewport: options.viewport });
  const transcript = createTranscriptRecorder({ source: 'test' });
  const recordFrame = host.recordFrame.bind(host);
  host.recordFrame = (frame: unknown) => {
    recordFrame(frame);
    transcript.record({ kind: 'frame', frame: frame as Frame });
  };
  const recordDiff = host.recordDiff.bind(host);
  host.recordDiff = (diff: unknown) => {
    recordDiff(diff);
    transcript.record({ kind: 'diff', diff: diff as RenderDiff });
  };
  const recordRestore = host.recordRestore.bind(host);
  host.recordRestore = (checkpoint) => {
    recordRestore(checkpoint);
    transcript.record({ kind: 'restore', checkpoint });
  };
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
    resize(viewport) {
      deliverHarnessResize(host, viewport);
      transcript.record({
        kind: 'input',
        event: { kind: 'resize', viewport }
      });
      return Promise.resolve();
    },
    async run(operation) {
      return operation(host);
    },
    snapshot() {
      return latestHarnessSnapshot(transcript.snapshot().steps, host.frames() as readonly Frame[]);
    },
    frames: () => host.frames() as readonly Frame[],
    diffs: () => host.diffs() as readonly RenderDiff[],
    restores: () => host.restores(),
    recordFrame: (frame) => { host.recordFrame(frame); },
    recordDiff: (diff) => { host.recordDiff(diff); },
    recordRestore: (checkpoint) => { host.recordRestore(checkpoint); },
    output: () => host.output()
  };
}

function deliverHarnessInputEvent(host: MemoryTerminalHost, event: InputEvent): void {
  if (event.kind === 'resize') {
    deliverHarnessResize(host, event.viewport);
    return;
  }
  if (event.kind === 'signal') {
    if (isTerminalSignal(event.signal)) host.signals.emit(event.signal);
    return;
  }
  if (event.kind === 'end') {
    host.stdin.close();
    return;
  }
  const encoded = encodeHarnessInputEvent(event);
  if (encoded !== undefined) host.input(encoded);
}

function deliverHarnessResize(host: MemoryTerminalHost, viewport: { readonly columns: number; readonly rows: number }): void {
  host.setViewport(viewport);
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
    if (step?.kind === 'frame') return step.frame.accessibility;
  }
  const lastFrame = frames.at(-1);
  if (lastFrame !== undefined) return lastFrame.accessibility;
  return createAccessibleSnapshot({
    source: 'widget',
    root: { id: 'terminal-harness', role: 'application', label: 'Terminal harness' }
  });
}
