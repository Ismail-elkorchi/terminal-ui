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
  let terminalSize = options.terminalSize ?? {
    columns: options.stdout?.columns ?? 80,
    rows: options.stdout?.rows ?? 24
  };
  const inputSource = new RuntimeInput({ ...options.stdin, isTty: options.stdin?.isTty ?? true });
  const stdin = new TerminalInputAuthority(inputSource);
  const stdout = new PtyOutput({ ...options.stdout, isTty: options.stdout?.isTty ?? true }, () => terminalSize);
  const stderr = new PtyOutput({ ...options.stderr, isTty: options.stderr?.isTty ?? true }, () => terminalSize);
  const output = createTerminalHostOutputAuthority(stdout, stderr, options.id ?? 'pty');
  const clock = new RuntimeClock();
  const runtime = options.runtime ?? 'node';
  const resolverInput = {
    host: {
      runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: terminalSize.columns,
      rows: terminalSize.rows,
      rawInput: options.stdin?.setRawMode !== undefined,
      resizeEvents: options.subscribeSignals !== undefined,
      terminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth }),
    ...(options.capabilities?.widthProfile === undefined ? {} : { widthProfile: options.capabilities.widthProfile }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides }),
    ...(options.capabilities?.graphics === undefined ? {} : { graphics: options.capabilities.graphics })
  } satisfies Parameters<typeof resolveTerminalCapabilities>[0];
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
