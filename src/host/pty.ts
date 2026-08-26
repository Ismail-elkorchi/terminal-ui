import { resolveTerminalCapabilities } from './capabilities.ts';
import { TerminalStateAuthorityBinding } from './terminal-state.ts';
import { ObjectEnvironment, RuntimeClock, RuntimeInput, RuntimeOutput, RuntimeSignals } from './runtime-streams.ts';
import { createTerminalHostOutputAuthority } from './ordered-output.ts';
import { TerminalInputAuthority } from './input-authority.ts';
import { TerminalCapabilityDetector } from './capability-detection.ts';
import { settleResourceDisposal } from './dispose.ts';
import type {
  PtyTerminalHost,
  PtyTerminalHostOptions,
  RuntimeTerminalOutputOptions,
  TerminalOperationContext,
  TerminalOutput,
  TerminalSize
} from './types.ts';

class PtyOutput implements TerminalOutput {
  readonly #output: RuntimeOutput;
  readonly #terminalSize: () => TerminalSize;

  constructor(
    options: RuntimeTerminalOutputOptions,
    terminalSize: () => TerminalSize
  ) {
    this.#output = new RuntimeOutput(options);
    this.#terminalSize = terminalSize;
  }

  get columns(): number {
    return this.#terminalSize().columns;
  }

  get rows(): number {
    return this.#terminalSize().rows;
  }

  write(chunk: string | Uint8Array, context: TerminalOperationContext = {}): Promise<void> {
    return this.#output.write(chunk, context);
  }

  writeRecovery(
    chunk: string | Uint8Array,
    context: TerminalOperationContext = {}
  ): Promise<import('./types.ts').TerminalWriteReceipt> {
    return this.#output.writeRecovery(chunk, context);
  }

  flush(context: TerminalOperationContext = {}): Promise<void> {
    return this.#output.flush(context);
  }

  dispose(context: TerminalOperationContext = {}): Promise<void> {
    return this.#output.dispose(context);
  }

  isTty(): boolean {
    return this.#output.isTty();
  }
}

export function createPtyTerminalHost(options: PtyTerminalHostOptions = {}): PtyTerminalHost {
  let terminalSize = initialPtyTerminalSize(options);
  const inputSource = new RuntimeInput({ ...options.stdin, isTty: options.stdin?.isTty ?? true });
  const stdin = new TerminalInputAuthority(inputSource);
  const stdout = new PtyOutput({ ...options.stdout, isTty: options.stdout?.isTty ?? true }, () => terminalSize);
  const stderr = new PtyOutput({ ...options.stderr, isTty: options.stderr?.isTty ?? true }, () => terminalSize);
  const output = createTerminalHostOutputAuthority(stdout, stderr, options.id ?? 'pty');
  const clock = new RuntimeClock();
  const runtime = options.runtime ?? 'node';
  const resolverInput = ptyCapabilityResolverInput(options, runtime, stdin, stdout, terminalSize);
  const env = new ObjectEnvironment(options.env ?? {});
  const setTerminalSize = async (nextTerminalSize: TerminalSize): Promise<void> => {
    terminalSize = nextTerminalSize;
    await options.resize?.(nextTerminalSize);
  };
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

  const host: PtyTerminalHost = {
    id: options.id ?? 'pty',
    runtime,
    stdin,
    stdout,
    stderr,
    signals: new RuntimeSignals(options.subscribeSignals),
    clock,
    env,
    terminalSizeControl: { setTerminalSize },
    ...(options.observer === undefined ? {} : { observer: options.observer }),
    getTerminalSize: () => terminalSize,
    getCapabilities: (detectionOptions) => detector.detect(detectionOptions),
    beginSession: (sessionOptions) =>
      terminalState.beginLease(sessionOptions?.id ?? `${options.id ?? 'pty'}-session`, detector.current()),
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

function initialPtyTerminalSize(options: PtyTerminalHostOptions): TerminalSize {
  return options.terminalSize ?? {
    columns: options.stdout?.columns ?? 80,
    rows: options.stdout?.rows ?? 24,
  };
}

function ptyCapabilityResolverInput(
  options: PtyTerminalHostOptions,
  runtime: NonNullable<PtyTerminalHostOptions['runtime']>,
  stdin: TerminalInputAuthority,
  stdout: TerminalOutput,
  terminalSize: TerminalSize,
): Parameters<typeof resolveTerminalCapabilities>[0] {
  const capabilities = options.capabilities;
  return {
    host: {
      runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: terminalSize.columns,
      rows: terminalSize.rows,
      supportsRawInput: options.stdin?.setRawMode !== undefined,
      supportsResizeEvents: options.subscribeSignals !== undefined,
      supportsTerminalProtocols: stdout.isTty(),
    },
    environment: { variables: options.env ?? {} },
    ...(capabilities?.probes === undefined ? {} : { probes: capabilities.probes }),
    ...(capabilities?.colorDepth === undefined ? {} : { colorDepth: capabilities.colorDepth }),
    ...(capabilities?.widthProfile === undefined ? {} : { widthProfile: capabilities.widthProfile }),
    ...(capabilities?.overrides === undefined ? {} : { overrides: capabilities.overrides }),
    ...(capabilities?.graphics === undefined ? {} : { graphics: capabilities.graphics }),
  };
}
