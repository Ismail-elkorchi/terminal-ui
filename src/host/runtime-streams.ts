import type { TerminalSize } from '../geometry/types.ts';
import { abortableSleep } from './abortable-sleep.ts';
import type { TerminalCapabilityConfiguration } from './capabilities.ts';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { TerminalCapabilityDetector } from './capability-detection.ts';
import type { RuntimeTarget } from './capability-types.ts';
import { settleResourceDisposal } from './dispose.ts';
import { TerminalInputAuthority } from './input-authority.ts';
import { NodeInput } from './node-input.ts';
import { waitForTerminalOperation } from './operation.ts';
import { OrderedOutputQueue, createTerminalHostOutputAuthority } from './ordered-output.ts';
import { TerminalStateAuthorityBinding } from './terminal-state.ts';
import type {
  NodeReadableTerminalStream,
  RuntimeInputSource,
  RuntimeTerminalInputOptions,
  RuntimeTerminalOutputOptions,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
  TerminalOperationContext,
  TerminalOutput,
  TerminalSignal,
  TerminalSignalSource,
  TerminalSleepOutcome,
  Unsubscribe,
} from './types.ts';
import {
  committedTerminalWrite,
  failedTerminalWrite,
  indeterminateTerminalWrite,
} from './write-receipt.ts';

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
  const stdin = new TerminalInputAuthority(inputSource, () => inputSource.dispose());
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
      supportsRawInput: options.stdin?.setRawMode !== undefined,
      supportsResizeEvents: options.subscribeSignals !== undefined,
      supportsTerminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth }),
    ...(options.capabilities?.widthProfile === undefined ? {} : { widthProfile: options.capabilities.widthProfile }),
    ...(options.capabilities?.graphics === undefined ? {} : { graphics: options.capabilities.graphics })
  } satisfies Parameters<typeof resolveTerminalCapabilities>[0];
  const terminalState = new TerminalStateAuthorityBinding();
  const detector = new TerminalCapabilityDetector({
    input: stdin,
    clock,
    resolverInput,
    beginSession: (id, capabilities) => terminalState.beginLease(id, capabilities),
    beginObservationRefresh: () => terminalState.beginObservationRefresh(),
    observeModes: (reports) => terminalState.observeModes(reports),
    observeKeyboardProfile: (profile) => terminalState.observeKeyboardProfile(profile),
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
    recoverTerminalState: (reason, options) => terminalState.recoverAll(reason, options),
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
    verifyKeyboardProfile: (flags, context) => detector.verifyKeyboardProfile(flags, context.signal),
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

  read(options: TerminalInputReadOptions = {}): AsyncIterable<TerminalInputChunk> {
    return {
      [Symbol.asyncIterator]: () => {
        const source = this.#options.source?.read(options)[Symbol.asyncIterator]();
        return {
          next: async () => {
            const result = await source?.next();
            // The authority owns cancellation and replays bytes consumed while
            // retiring a source. Never discard a completed read after abort.
            return result === undefined || result.done === true
              ? { done: true, value: undefined }
              : { done: false, value: { data: result.value } };
          },
          return: async () => {
            // A manual wrapper keeps return independent of a pending next().
            await source?.return?.();
            return { done: true, value: undefined };
          }
        };
      }
    };
  }

  async release(): Promise<void> {
    await this.#options.source?.release?.();
  }

  async dispose(): Promise<void> {
    await this.#options.source?.dispose?.();
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

  sleep(ms: number, signal?: AbortSignal): Promise<TerminalSleepOutcome> {
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

/** Node-compatible event streams support reusable native stdin ownership. */
export function runtimeInputSourceFromAsyncIterable(
  source: NodeReadableTerminalStream
): RuntimeInputSource {
  const input = new NodeInput(source);
  return {
    read(options = {}) {
      return {
        [Symbol.asyncIterator]: () => {
          const reader = input.read(options)[Symbol.asyncIterator]();
          return {
            next: async () => {
              const result = await reader.next();
              return result.done === true
                ? { done: true, value: undefined }
                : { done: false, value: result.value.data };
            },
            return: async () => {
              await reader.return?.();
              return { done: true, value: undefined };
            }
          };
        }
      };
    },
    release: () => input.release(),
    dispose: () => input.dispose()
  };
}
