import { resolveTerminalCapabilities } from './capabilities.ts';
import { TerminalStateAuthorityBinding } from './terminal-state.ts';
import { createTerminalHostOutputAuthority } from './ordered-output.ts';
import { settleResourceDisposal } from './dispose.ts';
import { throwIfTerminalOperationAborted } from './operation.ts';
import { committedTerminalWrite, failedTerminalWrite } from './write-receipt.ts';
import { TerminalInputAuthority } from './input-authority.ts';
import { TerminalCapabilityDetector } from './capability-detection.ts';
import type {
  ControlledTerminalClock,
  MemoryTerminalHostOptions,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
  TerminalOutput,
  TerminalOperationContext,
  TerminalRestoreResult,
  TerminalSignal,
  TerminalSignalSource,
  TerminalSize,
  Unsubscribe
} from './types.ts';

class QueueInput implements TerminalInput {
  #queue: TerminalInputChunk[] = [];
  #waiters: QueueInputWaiter[] = [];
  #closed = false;
  #rawMode = false;
  readonly #tty: boolean;

  constructor(tty = true) {
    this.#tty = tty;
  }

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
    return this.#tty;
  }
}

interface QueueInputWaiter {
  readonly resolve: (value: IteratorResult<TerminalInputChunk>) => void;
  readonly detach: () => void;
}

class BufferOutput implements TerminalOutput {
  #chunks: string[] = [];
  readonly #tty: boolean;
  readonly columns: number;
  readonly rows: number;

  constructor(columns = 80, rows = 24, tty = true) {
    this.columns = columns;
    this.rows = rows;
    this.#tty = tty;
  }

  write(chunk: string | Uint8Array, context: TerminalOperationContext = {}): Promise<void> {
    throwIfTerminalOperationAborted(context);
    this.#chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return Promise.resolve();
  }

  writeRecovery(
    chunk: string | Uint8Array,
    context: TerminalOperationContext = {}
  ): Promise<import('./types.ts').TerminalWriteReceipt> {
    if (context.signal?.aborted === true) {
      return Promise.resolve(failedTerminalWrite('memory-recovery-output', context.signal.reason));
    }
    this.#chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return Promise.resolve(committedTerminalWrite());
  }

  flush(context: TerminalOperationContext = {}): Promise<void> {
    throwIfTerminalOperationAborted(context);
    return Promise.resolve();
  }

  dispose(context: TerminalOperationContext = {}): Promise<void> {
    throwIfTerminalOperationAborted(context);
    return Promise.resolve();
  }

  isTty(): boolean {
    return this.#tty;
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

  monotonicNow(): number {
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

export interface MemoryTerminalHost extends TerminalHost {
  readonly stdin: TerminalInputAuthority;
  readonly stdout: BufferOutput;
  readonly stderr: BufferOutput;
  readonly signals: MemorySignals;
  readonly clock: ControlledTerminalClock;
  input(data: string | Uint8Array): void;
  endInput(): void;
  output(): string;
  frames(): readonly unknown[];
  diffs(): readonly unknown[];
  restores(): readonly TerminalRestoreResult[];
}

export function createMemoryTerminalHost(options?: MemoryTerminalHostOptions): MemoryTerminalHost;
export function createMemoryTerminalHost(options: unknown = {}): MemoryTerminalHost {
  const config = decodeMemoryTerminalHostOptions(options);
  let terminalSize: TerminalSize = config.terminalSize ?? { columns: 80, rows: 24 };
  const isTty = config.isTty ?? true;
  const inputSource = new QueueInput(isTty);
  const stdin = new TerminalInputAuthority(inputSource, () => { inputSource.close(); });
  const stdout = new BufferOutput(terminalSize.columns, terminalSize.rows, isTty);
  const stderr = new BufferOutput(terminalSize.columns, terminalSize.rows, isTty);
  const output = createTerminalHostOutputAuthority(stdout, stderr, config.id ?? 'memory');
  const signals = new MemorySignals();
  const clock = new MemoryClock();
  const {
    probes,
    colorDepth,
    widthProfile,
    graphics,
    overrides
  } = config.capabilities ?? {};
  const resolverInput = {
    host: {
      runtime: 'memory',
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: terminalSize.columns,
      rows: terminalSize.rows,
      rawInput: true,
      resizeEvents: true,
      terminalProtocols: isTty
    },
    environment: { variables: config.env ?? {} },
    ...(probes === undefined ? {} : { probes }),
    ...(colorDepth === undefined ? {} : { colorDepth }),
    ...(widthProfile === undefined ? {} : { widthProfile }),
    ...(graphics === undefined ? {} : { graphics }),
    ...(
      config.clipboardWrite === undefined && overrides === undefined
        ? {}
        : {
            overrides: {
              ...(overrides ?? {}),
              ...(config.clipboardWrite === undefined ? {} : { clipboardWrite: config.clipboardWrite })
            }
          }
    )
  } satisfies Parameters<typeof resolveTerminalCapabilities>[0];
  const env = new ObjectEnvironment(config.env ?? {});
  const frames: unknown[] = [];
  const diffs: unknown[] = [];
  const restores: TerminalRestoreResult[] = [];
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
  const host = {
    id: config.id ?? 'memory',
    runtime: 'memory',
    stdin,
    stdout,
    stderr,
    signals,
    clock,
    env,
    terminalSizeControl: {
      setTerminalSize(nextTerminalSize: TerminalSize) {
        terminalSize = nextTerminalSize;
      }
    },
    observer: {
      recordFrame(frame: unknown) {
        frames.push(frame);
        config.observer?.recordFrame?.(frame);
      },
      recordDiff(diff: unknown) {
        diffs.push(diff);
        config.observer?.recordDiff?.(diff);
      },
      recordRestore(result) {
        restores.push(result);
        config.observer?.recordRestore?.(result);
      }
    },
    getTerminalSize: () => terminalSize,
    getCapabilities: (detectionOptions) => detector.detect(detectionOptions),
    beginSession: (sessionOptions) =>
      terminalState.beginLease(sessionOptions?.id ?? 'memory-session', detector.current()),
    restoreTerminalState: (reason, options) => terminalState.restoreAll(reason, options),
    recoverTerminalState: (reason, options) => terminalState.recoverAll(reason, options),
    write: output.write,
    writeRecovery: output.writeRecovery,
    flush: output.flush,
    input: (data: string | Uint8Array) => { inputSource.push(data); },
    endInput: () => { inputSource.close(); },
    output: () => stdout.text(),
    frames: () => [...frames],
    diffs: () => [...diffs],
    restores: () => [...restores],
    dispose: async (context) => {
      await settleResourceDisposal([
        () => terminalState.restoreAllConfirmed('disposed', context),
        () => stdin.dispose(),
        () => output.dispose(context)
      ]);
    }
  } satisfies MemoryTerminalHost;
  terminalState.bind(host, {
    rawInputKnowledge: 'library_known',
    ...(config.initialState === undefined ? {} : { initialState: config.initialState })
  });
  return host;
}

function decodeMemoryTerminalHostOptions(value: unknown): MemoryTerminalHostOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Memory terminal host options must be an object.');
  }
  const options = value as Readonly<Record<string, unknown>>;
  const id = options['id'];
  const isTty = options['isTty'];
  const clipboardWrite = options['clipboardWrite'];
  if (id !== undefined && typeof id !== 'string') {
    throw new TypeError('Memory terminal host id must be a string when provided.');
  }
  if (isTty !== undefined && typeof isTty !== 'boolean') {
    throw new TypeError('Memory terminal host isTty must be a boolean when provided.');
  }
  if (clipboardWrite !== undefined && typeof clipboardWrite !== 'boolean') {
    throw new TypeError('Memory terminal host clipboardWrite must be a boolean when provided.');
  }
  const terminalSize = decodeTerminalSize(options['terminalSize']);
  const env = decodeMemoryEnvironment(options['env']);
  const observer = decodeMemoryObserver(options['observer']);
  const capabilities = options['capabilities'];
  const initialState = options['initialState'];
  if (capabilities !== undefined
    && (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities))) {
    throw new TypeError('Memory terminal host capabilities must be an object when provided.');
  }
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    ...(terminalSize === undefined ? {} : { terminalSize }),
    ...(isTty === undefined ? {} : { isTty }),
    ...(clipboardWrite === undefined ? {} : { clipboardWrite }),
    ...(env === undefined ? {} : { env }),
    ...(observer === undefined ? {} : { observer }),
    ...(capabilities === undefined
      ? {}
      : { capabilities }),
    ...(initialState === undefined
      ? {}
      : { initialState: initialState as NonNullable<MemoryTerminalHostOptions['initialState']> }),
  });
}

function decodeTerminalSize(value: unknown): MemoryTerminalHostOptions['terminalSize'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Memory terminal host terminalSize must be an object.');
  }
  const size = value as Readonly<Record<string, unknown>>;
  const columns = size['columns'];
  const rows = size['rows'];
  if (!Number.isSafeInteger(columns) || Number(columns) <= 0
    || !Number.isSafeInteger(rows) || Number(rows) <= 0) {
    throw new RangeError('Memory terminal host terminalSize columns and rows must be positive integers.');
  }
  return Object.freeze({ columns: Number(columns), rows: Number(rows) });
}

function decodeMemoryEnvironment(value: unknown): MemoryTerminalHostOptions['env'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Memory terminal host env must be an object.');
  }
  const env = { ...value };
  if (Object.values(env).some((entry) => typeof entry !== 'string')) {
    throw new TypeError('Memory terminal host env values must be strings.');
  }
  return Object.freeze(env);
}

function decodeMemoryObserver(value: unknown): MemoryTerminalHostOptions['observer'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Memory terminal host observer must be an object.');
  }
  const observer = value as Readonly<Record<string, unknown>>;
  const recordFrame = observer['recordFrame'];
  const recordDiff = observer['recordDiff'];
  const recordRestore = observer['recordRestore'];
  if (recordFrame !== undefined && typeof recordFrame !== 'function') {
    throw new TypeError('Memory terminal host observer.recordFrame must be a function when provided.');
  }
  if (recordDiff !== undefined && typeof recordDiff !== 'function') {
    throw new TypeError('Memory terminal host observer.recordDiff must be a function when provided.');
  }
  if (recordRestore !== undefined && typeof recordRestore !== 'function') {
    throw new TypeError('Memory terminal host observer.recordRestore must be a function when provided.');
  }
  return Object.freeze({
    ...(recordFrame === undefined
      ? {}
      : { recordFrame: recordFrame as NonNullable<NonNullable<MemoryTerminalHostOptions['observer']>['recordFrame']> }),
    ...(recordDiff === undefined
      ? {}
      : { recordDiff: recordDiff as NonNullable<NonNullable<MemoryTerminalHostOptions['observer']>['recordDiff']> }),
    ...(recordRestore === undefined
      ? {}
      : { recordRestore: recordRestore as NonNullable<NonNullable<MemoryTerminalHostOptions['observer']>['recordRestore']> }),
  });
}
