import { BasicTerminalSession } from './session.ts';
import { createCapabilities } from './capabilities.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  ControlledTerminalClock,
  MemoryTerminalHostOptions,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
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
  #waiters: ((value: IteratorResult<TerminalInputChunk>) => void)[] = [];
  #closed = false;
  #rawMode = false;

  constructor(private readonly tty = true) {}

  push(data: string | Uint8Array): void {
    if (this.#closed) return;
    const chunk = { data };
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter({ value: chunk, done: false });
      return;
    }
    this.#queue.push(chunk);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  async *read(): AsyncIterable<TerminalInputChunk> {
    while (!this.#closed || this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      const result = await new Promise<IteratorResult<TerminalInputChunk>>((resolve) => {
        this.#waiters.push(resolve);
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
      const sleeper: MemorySleep = {
        target,
        resolve,
        ...(signal === undefined ? {} : { signal })
      };
      const abort = (): void => {
        this.#sleepers = this.#sleepers.filter((item) => item !== sleeper);
        resolve();
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.#sleepers.push(sleeper);
    });
  }

  #resolveSleepers(): void {
    const pending = this.#sleepers;
    this.#sleepers = [];
    for (const sleeper of pending) {
      if (sleeper.signal?.aborted === true) continue;
      if (sleeper.target > this.#now) {
        this.#sleepers.push(sleeper);
        continue;
      }
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
  setViewport(viewport: TerminalViewport): void;
  recordFrame(frame: unknown): void;
  recordDiff(diff: unknown): void;
  recordRestore(checkpoint: TerminalStateSnapshot): void;
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
  const capabilities = createCapabilities({
    runtime: 'memory',
    inputIsTty: stdin.isTty(),
    outputIsTty: stdout.isTty(),
    columns: viewport.columns,
    rawInput: true
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
    setViewport: (nextViewport: TerminalViewport) => {
      viewport = nextViewport;
    },
    recordFrame: (frame: unknown) => {
      frames.push(frame);
    },
    recordDiff: (diff: unknown) => {
      diffs.push(diff);
    },
    recordRestore: (checkpoint: TerminalStateSnapshot) => {
      restores.push(checkpoint);
    },
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
