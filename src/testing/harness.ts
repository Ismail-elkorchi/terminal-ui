import type { MemoryTerminalHost } from '../host/memory.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { decodeInputChunk } from '../input/decoder.ts';
import { decodeInputEvent } from '../input/snapshot.ts';
import type { RecordedInputEvent } from '../input/types.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import { createHarnessSession } from './session.ts';
import type { TerminalHarness, TerminalHarnessOptions } from './types.ts';

export function createTerminalHarness(options: TerminalHarnessOptions = {}): TerminalHarness {
  const session = createHarnessSession({ id: 'terminal-harness', label: 'Terminal harness', commitPrefix: 'harness' });
  const { transcript } = session;
  let replayRestorePhase: 'checkpoint' | 'shutdown' | undefined;
  const host = createMemoryTerminalHost({
    ...(options.terminalSize === undefined ? {} : { terminalSize: options.terminalSize }),
    observer: {
      recordFrame: session.recordFrame,
      recordDiff: session.recordDiff,
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
        const runtime = session.runtime();
        if (runtime !== undefined) {
          return runtime.handleInputChunk({ data: event })
            .then(() => runtime.flushInput()).then(() => undefined);
        }
        host.input(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      const admitted = decodeInputEvent(event);
      const runtime = session.runtime();
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
      const runtime = session.runtime();
      if (runtime !== undefined) return runtime.resize(admitted.terminalSize).then(() => undefined);
      deliverHarnessResize(host, admitted.terminalSize);
      transcript.record({ kind: 'input', event: admitted });
      return Promise.resolve();
    },
    nextCommit: session.nextCommit,
    runApp: (app, operation) => session.runApp(host, app, operation),
    async run(operation) { return operation(host); },
    snapshot: session.snapshot,
    frames: session.frames,
    diffs: session.diffs,
    restores: () => host.restores(),
    recordCommit: session.recordCommit,
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
