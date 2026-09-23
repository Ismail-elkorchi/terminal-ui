import { diagnostic } from '../diagnostics.ts';
import { createPtyTerminalHost } from '../host/index.ts';
import { decodeInputChunk, decodeInputEvent } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import { latestRecordedSnapshot, recordedHarnessCommit } from './recording.ts';
import { createTuiRuntime } from '../tui/runtime.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type {
  TerminalSignal,
  TerminalRestoreResult,
  RuntimeInputSource,
  TerminalInputReadOptions,
} from '../host/index.ts';
import type { RecordedInputEvent } from '../input/index.ts';
import type { TuiRuntime } from '../tui/types.ts';
import type { Frame, FrameDescriptor, RenderDiff, RenderDiffDescriptor } from '../renderer/index.ts';
import type { PtyTerminalHarness, PtyTerminalHarnessOptions, PtyTerminalHarnessResult } from './types.ts';

class QueuedPtyInput implements RuntimeInputSource {
  #queue: (string | Uint8Array)[] = [];
  #waiters: QueuedPtyInputWaiter[] = [];
  #closed = false;
  #rawMode = false;

  push(data: string | Uint8Array): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter.detach();
      waiter.resolve({ value: data, done: false });
      return;
    }
    this.#queue.push(data);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.detach();
      waiter.resolve({ value: undefined, done: true });
    }
  }

  setRawMode(enabled: boolean): void {
    this.#rawMode = enabled;
  }

  isRawModeEnabled(): boolean {
    return this.#rawMode;
  }

  async *read(options: TerminalInputReadOptions = {}): AsyncIterable<string | Uint8Array> {
    while (!this.#closed || this.#queue.length > 0) {
      if (options.signal?.aborted === true) return;
      const next = this.#queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      const result = await this.#next(options.signal);
      if (result.done === true) return;
      yield result.value;
    }
  }

  #next(signal: AbortSignal | undefined): Promise<IteratorResult<string | Uint8Array>> {
    if (signal?.aborted === true) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      const abort = (): void => {
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) this.#waiters.splice(index, 1);
        resolve({ value: undefined, done: true });
      };
      const waiter: QueuedPtyInputWaiter = {
        resolve,
        detach: () => {
          signal?.removeEventListener('abort', abort);
        }
      };
      this.#waiters.push(waiter);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

interface QueuedPtyInputWaiter {
  readonly resolve: (result: IteratorResult<string | Uint8Array>) => void;
  readonly detach: () => void;
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
      status: 'unavailable',
      diagnostic: diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'PTY test adapter is unavailable.', {
        severity: 'warning',
        target: options.id ?? 'pty-harness',
        hint: 'Provide a caller-managed PTY adapter to enable PTY harness tests.'
      })
    };
  }
  return { status: 'available', harness: createAvailablePtyTerminalHarness(options) };
}

function createAvailablePtyTerminalHarness(options: PtyTerminalHarnessOptions): PtyTerminalHarness {
  const input = new QueuedPtyInput();
  const signals = new PtySignalBus();
  const output: string[] = [];
  const frames: FrameDescriptor[] = [];
  const diffs: RenderDiffDescriptor[] = [];
  const restores: TerminalRestoreResult[] = [];
  let pendingFrame: Frame | undefined;
  let commitSequence = 1;
  let activeRuntime: TuiRuntime<unknown, unknown> | undefined;
  const commitWaiters: { readonly resolve: (frame: Frame) => void; readonly reject: (cause: Error) => void }[] = [];
  const transcript = createTranscriptRecorder({ source: 'test' });
  const writeTerminalOutput = (chunk: string | Uint8Array): void => {
    const text = chunkText(chunk);
    output.push(text);
    const response = ptyProtocolResponse(text);
    if (response.length > 0) input.push(response);
  };
  const host = createPtyTerminalHost({
    id: options.id ?? 'pty-harness',
    env: { TERM: 'xterm-256color' },
    terminalSize: options.terminalSize ?? { columns: 80, rows: 24 },
    stdin: {
      source: input,
      isTty: true,
      setRawMode: (enabled) => { input.setRawMode(enabled); },
      isRawModeEnabled: () => input.isRawModeEnabled()
    },
    stdout: {
      isTty: true,
      write: writeTerminalOutput,
      recoveryWrite: (chunk) => { output.push(chunkText(chunk)); }
    },
    stderr: {
      isTty: true,
      write: (chunk) => { output.push(chunkText(chunk)); },
      recoveryWrite: (chunk) => { output.push(chunkText(chunk)); }
    },
    subscribeSignals: (listener) => signals.subscribe(listener),
    resize: () => { signals.emit('resize'); },
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
            commit: recordedHarnessCommit(
              `pty-harness:commit:${String(commitSequence)}`,
              commitSequence - 1,
              pendingFrame,
              typedDiff
            )
          });
          commitSequence += 1;
        }
        if (pendingFrame !== undefined && activeRuntime !== undefined) {
          for (const waiter of commitWaiters.splice(0)) waiter.resolve(pendingFrame);
        }
        pendingFrame = undefined;
      },
      recordRestore(result) {
        restores.push(result);
        transcript.record({ kind: 'restore', phase: 'checkpoint', result });
      }
    }
  });

  const harness: PtyTerminalHarness = {
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
        input.push(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      const admitted = decodeInputEvent(event);
      const runtime = activeRuntime;
      if (runtime !== undefined) {
        if (admitted.kind === 'resize') return runtime.resize(admitted.terminalSize).then(() => undefined);
        if (admitted.kind === 'signal' || admitted.kind === 'end') {
          throw new TypeError(`An attached TUI runtime cannot receive ${admitted.kind} as a semantic input event.`);
        }
        return runtime.handleInput(admitted)
          .then(() => runtime.flushInput()).then(() => undefined);
      }
      if (admitted.kind === 'resize') {
        return Promise.resolve(host.terminalSizeControl.setTerminalSize(admitted.terminalSize)).then(() => {
          transcript.record({ kind: 'input', event: admitted });
        });
      }
      deliverPtyHarnessInput(input, signals, admitted);
      transcript.record({ kind: 'input', event: admitted });
      return Promise.resolve();
    },
    async resize(terminalSize) {
      const admitted = decodeInputEvent({ kind: 'resize', terminalSize });
      if (admitted.kind !== 'resize') throw new Error('Expected a decoded resize event.');
      if (activeRuntime !== undefined) {
        await activeRuntime.resize(admitted.terminalSize);
        return;
      }
      await host.terminalSizeControl.setTerminalSize(admitted.terminalSize);
      transcript.record({ kind: 'input', event: admitted });
    },
    nextCommit() {
      if (activeRuntime === undefined) throw new Error('nextCommit requires an attached TUI app.');
      return new Promise<Frame>((resolve, reject) => { commitWaiters.push({ resolve, reject }); });
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
    closeInput() {
      input.close();
    },
    snapshot(): AccessibleSnapshot {
      return latestRecordedSnapshot(transcript.snapshot().steps, frames, {
        source: 'test_harness', id: 'pty-harness', label: 'PTY harness',
      });
    },
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => [...restores],
    output: () => output.join(''),
    recordCommit(commit) {
      frames.push(commit.frame);
      diffs.push(commit.diff);
      transcript.record({ kind: 'commit', commit });
    },
    recordRestore(result, phase) {
      restores.push(result);
      transcript.record({ kind: 'restore', phase, result });
    },
    async dispose() {
      input.close();
      await host.dispose();
    }
  };
  return harness;
}

const privateModeQueryPattern = new RegExp(String.raw`\u001B\[\?(\d+)\$p`, 'gu');

function ptyProtocolResponse(output: string): string {
  const responses: string[] = [];
  for (const match of output.matchAll(privateModeQueryPattern)) {
    const mode = match[1];
    if (mode === undefined) continue;
    responses.push(`\u001B[?${mode};${mode === '25' ? '1' : '2'}$y`);
  }
  if (output.includes('\u001B[c')) responses.push('\u001B[?1;2c');
  return responses.join('');
}

function deliverPtyHarnessInput(
  input: QueuedPtyInput,
  signals: PtySignalBus,
  event: Exclude<RecordedInputEvent, { readonly kind: 'resize' }>,
): void {
  if (event.kind === 'signal') {
    signals.emit(event.signal);
    return;
  }
  if (event.kind === 'end') {
    input.close();
    return;
  }
  const encoded = encodeHarnessInputEvent(event);
  input.push(encoded);
}

function chunkText(chunk: string | Uint8Array): string {
  return typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
}

export function isPtyHarnessUnavailable(
  result: PtyTerminalHarnessResult,
): result is Extract<PtyTerminalHarnessResult, { readonly status: 'unavailable' }> {
  return result.status === 'unavailable';
}
