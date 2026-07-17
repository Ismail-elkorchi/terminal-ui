import { BasicTerminalSession } from './session.ts';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  ControlledTerminalClock,
  MemoryTerminalHostOptions,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalSession,
  TerminalSignal,
  TerminalSignalSource,
  TerminalStateSnapshot,
  TerminalViewport,
  Unsubscribe
} from './types.ts';

class QueueInput implements TerminalInput {
  #queue: TerminalInputChunk[] = [];
  #waiters: QueueInputWaiter[] = [];
  #closed = false;
  #rawMode = false;

  constructor(private readonly tty = true) {}

  push(data: string | Uint8Array): void {
    if (this.#closed) return;
    const chunk = { data };
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter.detach();
      waiter.resolve({ value: chunk, done: false });
      return;
    }
    this.#queue.push(chunk);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.detach();
      waiter.resolve({ value: undefined, done: true });
    }
  }

  async *read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    while (!this.#closed || this.#queue.length > 0) {
      if (options.signal?.aborted === true) return;
      const next = this.#queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      const result = await new Promise<IteratorResult<TerminalInputChunk>>((resolve) => {
        const abort = (): void => {
          const index = this.#waiters.indexOf(waiter);
          if (index >= 0) this.#waiters.splice(index, 1);
          waiter.detach();
          resolve({ value: undefined, done: true });
        };
        const waiter: QueueInputWaiter = {
          resolve,
          detach: () => options.signal?.removeEventListener('abort', abort)
        };
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted === true) abort();
        else this.#waiters.push(waiter);
      });
      if (result.done === true) return;
      yield result.value;
    }
  }

  setRawMode(enabled: boolean): void {
    this.#rawMode = enabled;
  }

  isRawModeEnabled(): boolean {
    return this.#rawMode;
  }

  isTty(): boolean {
    return this.tty;
  }
}

interface QueueInputWaiter {
  readonly resolve: (value: IteratorResult<TerminalInputChunk>) => void;
  readonly detach: () => void;
}

class BufferOutput implements TerminalOutput {
  #chunks: string[] = [];

  constructor(
    readonly columns = 80,
    readonly rows = 24,
    private readonly tty = true
  ) {}

  write(chunk: string | Uint8Array): void {
    this.#chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
  }

  isTty(): boolean {
    return this.tty;
  }

  text(): string {
    return this.#chunks.join('');
  }

  clear(): void {
    this.#chunks = [];
  }
}

class MemorySignals implements TerminalSignalSource {
  #listeners = new Set<(signal: TerminalSignal) => void>();

  emit(signal: TerminalSignal): void {
    for (const listener of this.#listeners) listener(signal);
  }

  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

interface MemorySleep {
  readonly target: number;
  readonly signal?: AbortSignal;
  readonly resolve: () => void;
  readonly detach: () => void;
}

class MemoryClock implements ControlledTerminalClock {
  #now = 0;
  #sleepers: MemorySleep[] = [];

  now(): number {
    return this.#now;
  }

  advance(ms: number): void {
    if (ms < 0) throw new RangeError('ms must be non-negative.');
    this.#now += ms;
    this.#resolveSleepers();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms < 0) throw new RangeError('ms must be non-negative.');
    if (signal?.aborted === true || ms === 0) return Promise.resolve();
    const target = this.#now + ms;
    return new Promise((resolve) => {
      const abort = (): void => {
        this.#sleepers = this.#sleepers.filter((item) => item !== sleeper);
        sleeper.detach();
        sleeper.resolve();
      };
      const sleeper: MemorySleep = {
        target,
        resolve,
        detach: () => signal?.removeEventListener('abort', abort),
        ...(signal === undefined ? {} : { signal })
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.#sleepers.push(sleeper);
    });
  }

  #resolveSleepers(): void {
    const pending = this.#sleepers;
    this.#sleepers = [];
    for (const sleeper of pending) {
      if (sleeper.signal?.aborted === true) {
        sleeper.detach();
        continue;
      }
      if (sleeper.target > this.#now) {
        this.#sleepers.push(sleeper);
        continue;
      }
      sleeper.detach();
      sleeper.resolve();
    }
  }
}

class ObjectEnvironment implements TerminalEnvironment {
  constructor(private readonly values: Record<string, string>) {}

  get(name: string): string | undefined {
    return this.values[name];
  }

  entries(): Iterable<readonly [string, string]> {
    return Object.entries(this.values);
  }
}

export interface MemoryTerminalHost extends TerminalHost {
  readonly stdin: QueueInput;
  readonly stdout: BufferOutput;
  readonly stderr: BufferOutput;
  readonly signals: MemorySignals;
  readonly clock: ControlledTerminalClock;
  input(data: string | Uint8Array): void;
  output(): string;
  frames(): readonly unknown[];
  diffs(): readonly unknown[];
  restores(): readonly TerminalStateSnapshot[];
}

export function createMemoryTerminalHost(options: MemoryTerminalHostOptions = {}): MemoryTerminalHost {
  let viewport: TerminalViewport = options.viewport ?? { columns: 80, rows: 24 };
  const isTty = options.isTty ?? true;
  const stdin = new QueueInput(isTty);
  const stdout = new BufferOutput(viewport.columns, viewport.rows, isTty);
  const stderr = new BufferOutput(viewport.columns, viewport.rows, isTty);
  const signals = new MemorySignals();
  const clock = new MemoryClock();
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: viewport.columns,
      rows: viewport.rows,
      rawInput: true
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(
      options.clipboard === undefined && options.capabilities?.overrides === undefined
        ? {}
        : {
            overrides: {
              ...(options.capabilities?.overrides ?? {}),
              ...(options.clipboard === undefined ? {} : { clipboard: options.clipboard })
            }
          }
    )
  });
  const env = new ObjectEnvironment(options.env ?? {});
  const frames: unknown[] = [];
  const diffs: unknown[] = [];
  const restores: TerminalStateSnapshot[] = [];

  const host = {
    id: options.id ?? 'memory',
    runtime: 'memory',
    stdin,
    stdout,
    stderr,
    signals,
    clock,
    env,
    viewportControl: {
      setViewport(nextViewport: TerminalViewport) {
        viewport = nextViewport;
      }
    },
    observer: {
      recordFrame(frame: unknown) {
        frames.push(frame);
        options.observer?.recordFrame?.(frame);
      },
      recordDiff(diff: unknown) {
        diffs.push(diff);
        options.observer?.recordDiff?.(diff);
      },
      recordRestore(checkpoint: TerminalStateSnapshot) {
        restores.push(checkpoint);
        options.observer?.recordRestore?.(checkpoint);
      }
    },
    getViewport: () => viewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? 'memory-session', host, capabilities)),
    write: (output: TerminalOutputChunk): Promise<void> => {
      if (output.text !== undefined) stdout.write(output.text);
      if (output.bytes !== undefined) stdout.write(output.bytes);
      return Promise.resolve();
    },
    input: (data: string | Uint8Array) => { stdin.push(data); },
    output: () => stdout.text(),
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => [...restores],
    dispose: async () => {
      try {
        await restoreActiveTerminalSessions(host, 'disposed');
      } finally {
        stdin.close();
      }
    }
  } satisfies MemoryTerminalHost;
  return host;
}
