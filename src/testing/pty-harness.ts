import { diagnostic } from '../diagnostics.ts';
import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { createPtyTerminalHost } from '../host/index.ts';
import { decodeInputChunk } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  PtyTerminalHost,
  TerminalSignal,
  TerminalStateSnapshot,
} from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../tui/index.ts';
import type { InteractionTranscriptStep } from '../transcript/index.ts';
import type { PtyTerminalHarness, PtyTerminalHarnessOptions, PtyTerminalHarnessResult } from './types.ts';

class QueuedPtyInput implements AsyncIterable<string | Uint8Array> {
  #queue: (string | Uint8Array)[] = [];
  #waiters: ((result: IteratorResult<string | Uint8Array>) => void)[] = [];
  #closed = false;
  #rawMode = false;

  push(data: string | Uint8Array): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter({ value: data, done: false });
      return;
    }
    this.#queue.push(data);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  setRawMode(enabled: boolean): void {
    this.#rawMode = enabled;
  }

  isRawModeEnabled(): boolean {
    return this.#rawMode;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    while (!this.#closed || this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      const result = await new Promise<IteratorResult<string | Uint8Array>>((resolve) => {
        this.#waiters.push(resolve);
      });
      if (result.done === true) return;
      yield result.value;
    }
  }
}

class PtySignalBus {
  #listeners = new Set<(signal: TerminalSignal) => void>();

  emit(signal: TerminalSignal): void {
    for (const listener of this.#listeners) listener(signal);
  }

  subscribe(listener: (signal: TerminalSignal) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export function createPtyTerminalHarness(options: PtyTerminalHarnessOptions = {}): PtyTerminalHarnessResult {
  if (options.available === false) {
    return {
      ok: false,
      diagnostic: diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'PTY test adapter is unavailable.', {
        severity: 'warning',
        target: options.id ?? 'pty-harness',
        hint: 'Provide a caller-managed PTY adapter to enable PTY harness tests.'
      })
    };
  }
  return { ok: true, harness: createAvailablePtyTerminalHarness(options) };
}

function createAvailablePtyTerminalHarness(options: PtyTerminalHarnessOptions): PtyTerminalHarness {
  const input = new QueuedPtyInput();
  const signals = new PtySignalBus();
  const output: string[] = [];
  const frames: Frame[] = [];
  const diffs: RenderDiff[] = [];
  const restores: TerminalStateSnapshot[] = [];
  const transcript = createTranscriptRecorder({ source: 'test' });
  const host = createPtyTerminalHost({
    id: options.id ?? 'pty-harness',
    viewport: options.viewport ?? { columns: 80, rows: 24 },
    stdin: {
      source: input,
      isTty: true,
      setRawMode: (enabled) => { input.setRawMode(enabled); },
      isRawModeEnabled: () => input.isRawModeEnabled()
    },
    stdout: {
      isTty: true,
      write: (chunk) => { output.push(chunkText(chunk)); }
    },
    stderr: {
      isTty: true,
      write: (chunk) => { output.push(chunkText(chunk)); }
    },
    subscribeSignals: (listener) => signals.subscribe(listener),
    resize: () => { signals.emit('resize'); }
  }) as PtyTerminalHost & {
    recordFrame?: (frame: Frame) => void;
    recordDiff?: (diff: RenderDiff) => void;
    recordRestore?: (checkpoint: TerminalStateSnapshot) => void;
  };

  host.recordFrame = (frame) => {
    frames.push(frame);
    transcript.record({ kind: 'frame', frame });
  };
  host.recordDiff = (diff) => {
    diffs.push(diff);
    transcript.record({ kind: 'diff', diff });
  };
  host.recordRestore = (checkpoint) => {
    restores.push(checkpoint);
    transcript.record({ kind: 'restore', checkpoint });
  };

  const harness: PtyTerminalHarness = {
    host,
    clock: host.clock,
    transcript,
    input(event) {
      if (typeof event === 'string') {
        input.push(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      deliverPtyHarnessInput(input, signals, event);
      transcript.record({ kind: 'input', event });
      return Promise.resolve();
    },
    async resize(viewport) {
      await host.resize(viewport);
      transcript.record({ kind: 'input', event: { kind: 'resize', viewport } });
    },
    closeInput() {
      input.close();
    },
    snapshot(): AccessibleSnapshot {
      return latestPtyHarnessSnapshot(transcript.snapshot().steps, frames);
    },
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => [...restores],
    output: () => output.join(''),
    recordFrame(frame) {
      host.recordFrame?.(frame);
    },
    recordDiff(diff) {
      host.recordDiff?.(diff);
    },
    recordRestore(checkpoint) {
      host.recordRestore?.(checkpoint);
    },
    async dispose() {
      input.close();
      await host.dispose?.();
    }
  };
  return harness;
}

function deliverPtyHarnessInput(input: QueuedPtyInput, signals: PtySignalBus, event: InputEvent): void {
  if (event.kind === 'resize') {
    signals.emit('resize');
    return;
  }
  if (event.kind === 'signal') {
    if (isTerminalSignal(event.signal)) signals.emit(event.signal);
    return;
  }
  if (event.kind === 'end') {
    input.close();
    return;
  }
  const encoded = encodeHarnessInputEvent(event);
  if (encoded !== undefined) input.push(encoded);
}

function isTerminalSignal(signal: string): signal is TerminalSignal {
  return signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGHUP' || signal === 'resize';
}

function chunkText(chunk: string | Uint8Array): string {
  return typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
}

function latestPtyHarnessSnapshot(
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
  return toAccessibleSnapshot({
    source: 'widget',
    root: { id: 'pty-harness', role: 'application', label: 'PTY harness' }
  });
}

export function isPtyHarnessUnavailable(result: PtyTerminalHarnessResult): result is {
  readonly ok: false;
  readonly diagnostic: TerminalDiagnostic;
} {
  return !result.ok;
}
