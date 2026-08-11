import { diagnostic } from '../diagnostics.ts';
import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { createPtyTerminalHost } from '../host/index.ts';
import { decodeInputChunk, decodeInputEvent } from '../input/index.ts';
import { createTranscriptRecorder } from '../transcript/index.ts';
import { encodeHarnessInputEvent } from './input-events.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  TerminalSignal,
  TerminalRestoreResult,
  RuntimeInputSource,
  TerminalInputReadOptions,
} from '../host/index.ts';
import type { RecordedInputEvent } from '../input/index.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { InteractionTranscriptStep, TranscriptRuntimeCommit } from '../transcript/index.ts';
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
  const restores: TerminalRestoreResult[] = [];
  let pendingFrame: Frame | undefined;
  let commitSequence = 1;
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
        if (pendingFrame !== undefined) {
          transcript.record({
            kind: 'commit',
            commit: ptyHarnessCommit(
              `pty-harness:commit:${String(commitSequence)}`,
              commitSequence - 1,
              pendingFrame,
              typedDiff
            )
          });
          commitSequence += 1;
          pendingFrame = undefined;
        }
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
        input.push(event);
        for (const decoded of decodeInputChunk({ data: event })) transcript.record({ kind: 'input', event: decoded });
        return Promise.resolve();
      }
      const admitted = decodeInputEvent(event);
      deliverPtyHarnessInput(input, signals, admitted);
      transcript.record({ kind: 'input', event: admitted });
      return Promise.resolve();
    },
    async resize(terminalSize) {
      const admitted = decodeInputEvent({ kind: 'resize', terminalSize });
      if (admitted.kind !== 'resize') throw new Error('Expected a decoded resize event.');
      await host.terminalSizeControl.setTerminalSize(admitted.terminalSize);
      transcript.record({ kind: 'input', event: admitted });
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

function deliverPtyHarnessInput(input: QueuedPtyInput, signals: PtySignalBus, event: RecordedInputEvent): void {
  if (event.kind === 'resize') {
    signals.emit('resize');
    return;
  }
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

function latestPtyHarnessSnapshot(
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
  return toAccessibleSnapshot({
    source: 'test_harness',
    root: { id: 'pty-harness', role: 'group', label: 'PTY harness' }
  });
}

function ptyHarnessCommit(
  id: string,
  stateVersion: number,
  frame: Frame,
  diff: RenderDiff
): TranscriptRuntimeCommit {
  return {
    id,
    stateVersion,
    terminalSize: { columns: frame.width, rows: frame.height },
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    frame,
    diff
  };
}

export function isPtyHarnessUnavailable(result: PtyTerminalHarnessResult): result is {
  readonly ok: false;
  readonly diagnostic: TerminalDiagnostic;
} {
  return !result.ok;
}
