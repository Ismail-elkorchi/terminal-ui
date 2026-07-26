import { resolveTerminalCapabilities } from './capabilities.ts';
import { abortableSleep } from './abortable-sleep.ts';
import { settleResourceDisposal } from './dispose.ts';
import { TerminalStateAuthorityBinding } from './terminal-state.ts';
import { OrderedOutputQueue, createTerminalHostOutputAuthority } from './ordered-output.ts';
import { waitForTerminalOperation } from './operation.ts';
import { TerminalInputAuthority } from './input-authority.ts';
import { TerminalCapabilityDetector } from './capability-detection.ts';
import { committedTerminalWrite, failedTerminalWrite, indeterminateTerminalWrite } from './write-receipt.ts';
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
  TerminalOperationContext,
  TerminalSignal,
  TerminalSignalSource,
  TerminalSize,
  Unsubscribe
} from './types.ts';
import type { TerminalCapabilityConfiguration } from './capabilities.ts';

export interface StreamTerminalHostOptions {
  readonly id: string;
  readonly runtime: RuntimeTarget;
  readonly stdin?: RuntimeTerminalInputOptions;
  readonly stdout?: RuntimeTerminalOutputOptions;
  readonly stderr?: RuntimeTerminalOutputOptions;
  readonly stdoutOutput?: TerminalOutput;
  readonly stderrOutput?: TerminalOutput;
  readonly getTerminalSize?: () => TerminalSize | undefined;
  readonly env?: Record<string, string>;
  readonly subscribeSignals?: (listener: (signal: TerminalSignal) => void) => Unsubscribe;
  readonly capabilities?: TerminalCapabilityConfiguration;
  readonly initialState?: import('./types.ts').TerminalInitialState;
}

export function createStreamTerminalHost(options: StreamTerminalHostOptions): TerminalHost {
  const inputSource = new RuntimeInput(options.stdin);
  const stdin = new TerminalInputAuthority(inputSource);
  const stdout = options.stdoutOutput ?? new RuntimeOutput(options.stdout);
  const stderr = options.stderrOutput ?? new RuntimeOutput(options.stderr);
  const clock = new RuntimeClock();
  const output = createTerminalHostOutputAuthority(stdout, stderr, options.id);
  const getTerminalSize = (): TerminalSize => options.getTerminalSize?.() ?? {
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24
  };
  const initialTerminalSize = getTerminalSize();
  const resolverInput = {
    host: {
      runtime: options.runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: initialTerminalSize.columns,
      rows: initialTerminalSize.rows,
      rawInput: options.stdin?.setRawMode !== undefined,
      resizeEvents: options.subscribeSignals !== undefined,
      terminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth }),
    ...(options.capabilities?.widthProfile === undefined ? {} : { widthProfile: options.capabilities.widthProfile })
  } satisfies Parameters<typeof resolveTerminalCapabilities>[0];
  const terminalState = new TerminalStateAuthorityBinding();
  const detector = new TerminalCapabilityDetector({
    input: stdin,
    clock,
    resolverInput,
    beginSession: (id, capabilities) => terminalState.beginLease(id, capabilities),
    write: (chunk, signal) => output.write(chunk, { signal })
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
    getTerminalSize,
    getCapabilities: (detectionOptions) => detector.detect(detectionOptions),
    beginSession: (sessionOptions) =>
      terminalState.beginLease(sessionOptions?.id ?? `${options.id}-session`, detector.current()),
    restoreTerminalState: (reason, options) => terminalState.restoreAll(reason, options),
    write: output.write,
    writeRecovery: output.writeRecovery,
    flush: output.flush,
    dispose: async (context) => {
      await settleResourceDisposal([
        () => terminalState.restoreAllConfirmed('disposed', context),
        () => stdin.dispose(),
        () => output.dispose(context)
      ]);
    }
  };
  terminalState.bind(host, {
    rawInputKnowledge: options.stdin?.isRawModeEnabled === undefined ? 'library_known' : 'observed',
    ...(options.initialState === undefined ? {} : { initialState: options.initialState })
  });
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
  #disposal: Promise<void> | undefined;
  #phase: 'open' | 'disposing' | 'disposed' = 'open';
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

  write(chunk: string | Uint8Array, context: TerminalOperationContext = {}): Promise<void> {
    if (this.#phase !== 'open') {
      return Promise.reject(new Error('Terminal output is not writable after disposal begins.'));
    }
    return this.#queue.run(async (operationContext) => {
      if (this.#options.write !== undefined) {
        await this.#options.write(chunk, operationContext);
        return;
      }
      if (this.#options.writable !== undefined) {
        this.#writer ??= this.#options.writable.getWriter();
        await this.#writer.write(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      }
    }, context);
  }

  async writeRecovery(
    chunk: string | Uint8Array,
    context: TerminalOperationContext = {}
  ): Promise<import('./types.ts').TerminalWriteReceipt> {
    if (context.signal?.aborted === true) {
      return failedTerminalWrite('runtime-recovery-output', context.signal.reason);
    }
    if (this.#phase !== 'open') {
      return failedTerminalWrite('runtime-recovery-output', new Error('Terminal output is not writable after disposal begins.'));
    }
    try {
      if (this.#options.recoveryWrite !== undefined) {
        await this.#options.recoveryWrite(chunk, context);
      } else if (this.#options.writable !== undefined) {
        this.#writer ??= this.#options.writable.getWriter();
        await waitForTerminalOperation(
          this.#writer.write(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk),
          context
        );
      } else {
        return failedTerminalWrite('runtime-recovery-output', new Error('The output adapter has no recovery-write authority.'));
      }
      return committedTerminalWrite();
    } catch (cause) {
      return indeterminateTerminalWrite('runtime-recovery-output', cause);
    }
  }

  async flush(context: TerminalOperationContext = {}): Promise<void> {
    await this.#queue.flush(context);
    if (this.#writer !== undefined) await waitForTerminalOperation(this.#writer.ready, context);
  }

  async dispose(context: TerminalOperationContext = {}): Promise<void> {
    if (this.#disposal === undefined) {
      this.#phase = 'disposing';
      const releaseWriter = this.#queue.run(() => {
        const writer = this.#writer;
        if (writer !== undefined) {
          writer.releaseLock();
          if (this.#writer === writer) this.#writer = undefined;
        }
        return Promise.resolve();
      });
      this.#disposal = releaseWriter
        .then(() => this.#queue.flush())
        .finally(() => {
          this.#phase = 'disposed';
        });
    }
    await waitForTerminalOperation(this.#disposal, context);
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
    return abortableSleep(ms, signal);
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
      let cancellation: Promise<void> | undefined;
      const abort = (): void => {
        cancellation ??= reader.cancel();
        void cancellation.catch(() => undefined);
      };
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
        try {
          await cancellation;
        } finally {
          reader.releaseLock();
        }
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
      const { promise: aborted, resolve: resolveAbort } =
        Promise.withResolvers<IteratorResult<string | Uint8Array>>();
      const abort = (): void => {
        resolveAbort({ done: true, value: undefined });
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          const next = signal === undefined ? await iterator.next() : await Promise.race([iterator.next(), aborted]);
          if (next.done === true || isAborted(signal)) return;
          yield next.value;
        }
      } finally {
        signal?.removeEventListener('abort', abort);
        await iterator.return?.();
      }
    }
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}
