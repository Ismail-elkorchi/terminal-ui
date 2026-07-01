import { resolveTerminalCapabilities } from './capabilities.ts';
import { BasicTerminalSession } from './session.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type { RuntimeTarget } from '../package.ts';
import type {
  RuntimeInputSource,
  RuntimeTerminalInputOptions,
  RuntimeTerminalOutputOptions,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalSession,
  TerminalSignal,
  TerminalSignalSource,
  TerminalViewport,
  Unsubscribe
} from './types.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';

export interface StreamTerminalHostOptions {
  readonly id: string;
  readonly runtime: RuntimeTarget;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly env?: Record<string, string>;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
}

export function createStreamTerminalHost(options: StreamTerminalHostOptions): TerminalHost {
  const stdin = new RuntimeInput(options.stdin);
  const stdout = new RuntimeOutput(options.stdout);
  const stderr = new RuntimeOutput(options.stderr);
  const clock = new RuntimeClock();
  const getViewport = (): TerminalViewport => ({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24
  });
  const capabilities: TerminalCapabilityProfile = resolveTerminalCapabilities({
    host: {
      runtime: options.runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: getViewport().columns,
      rows: getViewport().rows,
      rawInput: options.stdin?.setRawMode !== undefined
    },
    environment: { variables: options.env ?? {} }
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
    write: async (output: TerminalOutputChunk) => {
      if (output.text !== undefined) await stdout.write(output.text);
      if (output.bytes !== undefined) await stdout.write(output.bytes);
    },
    flush: () => Promise.resolve(),
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
    }
  };
  return host;
}

export class RuntimeInput implements TerminalInput {
  #rawMode = false;

  constructor(private readonly options: RuntimeTerminalInputOptions = {}) {}

  async *read(): AsyncIterable<TerminalInputChunk> {
    for await (const chunk of inputSourceToAsyncIterable(this.options.source)) {
      yield { data: chunk };
    }
  }

  async setRawMode(enabled: boolean): Promise<void> {
    await this.options.setRawMode?.(enabled);
    this.#rawMode = enabled;
  }

  isRawModeEnabled(): boolean {
    return this.options.isRawModeEnabled?.() ?? this.#rawMode;
  }

  isTty(): boolean {
    return this.options.isTty ?? false;
  }
}

export class RuntimeOutput implements TerminalOutput {
  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;

  constructor(private readonly options: RuntimeTerminalOutputOptions = {}) {}

  get columns(): number | undefined {
    return this.options.columns;
  }

  get rows(): number | undefined {
    return this.options.rows;
  }

  async write(chunk: string | Uint8Array): Promise<void> {
    if (this.options.write !== undefined) {
      await this.options.write(chunk);
      return;
    }
    if (this.options.writable !== undefined) {
      this.#writer ??= this.options.writable.getWriter();
      await this.#writer.write(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    }
  }

  isTty(): boolean {
    return this.options.isTty ?? false;
  }
}

export class RuntimeSignals implements TerminalSignalSource {
  constructor(private readonly subscribeHook?: (listener: (signal: TerminalSignal) => void) => Unsubscribe) {}

  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe {
    return this.subscribeHook?.(listener) ?? (() => undefined);
  }
}

export class RuntimeClock implements TerminalClock {
  now(): number {
    return Date.now();
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
  constructor(private readonly values: Record<string, string>) {}

  get(name: string): string | undefined {
    return this.values[name];
  }

  entries(): Iterable<readonly [string, string]> {
    return Object.entries(this.values);
  }
}

async function* inputSourceToAsyncIterable(
  source: RuntimeInputSource | undefined
): AsyncIterable<string | Uint8Array> {
  if (source === undefined) return;
  if (isWebReadableStream(source)) {
    const reader = source.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  yield* source;
}

function isWebReadableStream(value: RuntimeInputSource): value is ReadableStream<string | Uint8Array> {
  return typeof (value as ReadableStream<string | Uint8Array>).getReader === 'function';
}
