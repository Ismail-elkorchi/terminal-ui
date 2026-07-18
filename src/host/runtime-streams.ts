import { resolveTerminalCapabilities } from './capabilities.ts';
import { BasicTerminalSession } from './session.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import { OrderedOutputQueue, createTerminalHostOutputAuthority } from './ordered-output.ts';
import type { RuntimeTarget } from './capability-types.ts';
import type {
  RuntimeInputSource,
  RuntimeTerminalInputOptions,
  RuntimeTerminalOutputOptions,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
  TerminalOutput,
  TerminalSession,
  TerminalSignal,
  TerminalSignalSource,
  TerminalViewport,
  Unsubscribe
} from './types.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';
import type { TerminalCapabilityConfiguration } from './capabilities.ts';

export interface StreamTerminalHostOptions {
  readonly id: string;
  readonly runtime: RuntimeTarget;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly stdoutOutput?: TerminalOutput;
  readonly stderrOutput?: TerminalOutput;
  readonly getViewport?: () => TerminalViewport | undefined;
  readonly env?: Record<string, string>;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly capabilities?: TerminalCapabilityConfiguration;
}

export function createStreamTerminalHost(options: StreamTerminalHostOptions): TerminalHost {
  const stdin = new RuntimeInput(options.stdin);
  const stdout = options.stdoutOutput ?? new RuntimeOutput(options.stdout);
  const stderr = options.stderrOutput ?? new RuntimeOutput(options.stderr);
  const clock = new RuntimeClock();
  const output = createTerminalHostOutputAuthority(stdout, stderr);
  const getViewport = (): TerminalViewport => options.getViewport?.() ?? {
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24
  };
  const initialViewport = getViewport();
  const capabilities: TerminalCapabilityProfile = resolveTerminalCapabilities({
    host: {
      runtime: options.runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: initialViewport.columns,
      rows: initialViewport.rows,
      rawInput: options.stdin?.setRawMode !== undefined,
      resizeEvents: options.subscribeSignals !== undefined,
      terminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth })
  });
  const host: TerminalHost = {
    id: options.id,
    runtime: options.runtime,
    stdin,
    stdout,
    stderr,
    signals: new RuntimeSignals(options.subscribeSignals),
    clock,
    env: new ObjectEnvironment(options.env ?? {}),
    getViewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? `${options.id}-session`, host, capabilities)),
    write: output.write,
    flush: output.flush,
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
    }
  };
  return host;
}

export class RuntimeInput implements TerminalInput {
  #rawMode = false;
  readonly #options: RuntimeTerminalInputOptions;

  constructor(options: RuntimeTerminalInputOptions = {}) {
    this.#options = options;
  }

  async *read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    if (this.#options.source === undefined) return;
    for await (const chunk of this.#options.source.read(options)) {
      if (options.signal?.aborted === true) return;
      yield { data: chunk };
    }
  }

  async setRawMode(enabled: boolean): Promise<void> {
    await this.#options.setRawMode?.(enabled);
    this.#rawMode = enabled;
  }

  isRawModeEnabled(): boolean {
    return this.#options.isRawModeEnabled?.() ?? this.#rawMode;
  }

  isTty(): boolean {
    return this.#options.isTty ?? false;
  }
}

export class RuntimeOutput implements TerminalOutput {
  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  readonly #queue = new OrderedOutputQueue();
  readonly #options: RuntimeTerminalOutputOptions;

  constructor(options: RuntimeTerminalOutputOptions = {}) {
    this.#options = options;
  }

  get columns(): number | undefined {
    return this.#options.columns;
  }

  get rows(): number | undefined {
    return this.#options.rows;
  }

  write(chunk: string | Uint8Array): Promise<void> {
    return this.#queue.run(async () => {
      if (this.#options.write !== undefined) {
        await this.#options.write(chunk);
        return;
      }
      if (this.#options.writable !== undefined) {
        this.#writer ??= this.#options.writable.getWriter();
        await this.#writer.write(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      }
    });
  }

  async flush(): Promise<void> {
    await this.#queue.flush();
    if (this.#writer !== undefined) await this.#writer.ready;
  }

  isTty(): boolean {
    return this.#options.isTty ?? false;
  }
}

export class RuntimeSignals implements TerminalSignalSource {
  readonly #subscribeHook: ((listener: (signal: TerminalSignal) => void) => Unsubscribe) | undefined;

  constructor(subscribeHook?: (listener: (signal: TerminalSignal) => void) => Unsubscribe) {
    this.#subscribeHook = subscribeHook;
  }

  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe {
    return this.#subscribeHook?.(listener) ?? (() => undefined);
  }
}

export class RuntimeClock implements TerminalClock {
  monotonicNow(): number {
    return globalThis.performance.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted === true) {
        resolve();
        return;
      }
      const timeout = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
  }
}

export class ObjectEnvironment implements TerminalEnvironment {
  readonly #values: Record<string, string>;

  constructor(values: Record<string, string>) {
    this.#values = values;
  }

  get(name: string): string | undefined {
    return this.#values[name];
  }

  entries(): Iterable<readonly [string, string]> {
    return Object.entries(this.#values);
  }
}

export function runtimeInputSourceFromReadableStream(
  source: ReadableStream<string | Uint8Array>
): RuntimeInputSource {
  return {
    async *read(options = {}) {
      const signal = options.signal;
      if (isAborted(signal)) return;
      const reader = source.getReader();
      const abort = (): void => { void reader.cancel(); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done || isAborted(signal)) return;
          yield next.value;
        }
      } catch (cause) {
        if (!isAborted(signal)) throw cause;
      } finally {
        signal?.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    }
  };
}

export function runtimeInputSourceFromAsyncIterable(
  source: AsyncIterable<string | Uint8Array>
): RuntimeInputSource {
  return {
    async *read(options = {}) {
      const signal = options.signal;
      if (isAborted(signal)) return;
      const iterator = source[Symbol.asyncIterator]();
      let resolveAbort = (): void => undefined;
      const abort = (): void => {
        resolveAbort();
      };
      const aborted = new Promise<IteratorResult<string | Uint8Array>>((resolve) => {
        resolveAbort = () => {
          resolve({ done: true, value: undefined });
        };
      });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          const next = signal === undefined ? await iterator.next() : await Promise.race([iterator.next(), aborted]);
          if (next.done === true || isAborted(signal)) return;
          yield next.value;
        }
      } finally {
        signal?.removeEventListener('abort', abort);
        const completion = iterator.return?.();
        if (!isAborted(signal)) await completion;
      }
    }
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}
