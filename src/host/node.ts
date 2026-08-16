import process from 'node:process';
import { abortableSleep } from './abortable-sleep.ts';
import { settleResourceDisposal } from './dispose.ts';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { NodeTerminalOutput } from './node-output.ts';
import { createTerminalHostOutputAuthority } from './ordered-output.ts';
import { NodeInput } from './node-input.ts';
import { TerminalInputAuthority } from './input-authority.ts';
import { TerminalCapabilityDetector } from './capability-detection.ts';
import { TerminalStateAuthorityBinding } from './terminal-state.ts';
import type {
  NodeTerminalHostOptions,
  NodeTerminalSignal,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalSignal,
  TerminalSignalSource,
  TerminalSize,
  Unsubscribe
} from './types.ts';

class NodeSignals implements TerminalSignalSource {
  readonly #source: Pick<NonNullable<NodeTerminalHostOptions['process']>, 'on' | 'off'>;
  readonly #output: NodeTerminalHostOptions['stdout'] | undefined;

  constructor(
    source: Pick<NonNullable<NodeTerminalHostOptions['process']>, 'on' | 'off'> = process,
    output?: NodeTerminalHostOptions['stdout']
  ) {
    this.#source = source;
    this.#output = output;
  }

  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe {
    const signals: NodeTerminalSignal[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const handler = (signal: NodeTerminalSignal): void => {
      const mapped = terminalSignalFromNodeSignal(signal);
      if (mapped !== undefined) listener(mapped);
    };
    for (const signal of signals) this.#source.on(signal, handler);
    const resize = (): void => { listener('resize'); };
    const output = this.#output;
    if (output?.on !== undefined) output.on('resize', resize);
    return () => {
      for (const signal of signals) this.#source.off(signal, handler);
      if (output?.off !== undefined) output.off('resize', resize);
    };
  }
}

function terminalSignalFromNodeSignal(signal: NodeTerminalSignal): TerminalSignal | undefined {
  switch (signal) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGHUP':
      return signal;
    default:
      return undefined;
  }
}

class NodeClock implements TerminalClock {
  monotonicNow(): number {
    return globalThis.performance.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return abortableSleep(ms, signal);
  }
}

class ProcessEnvironment implements TerminalEnvironment {
  readonly #env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined>) {
    this.#env = env;
  }

  get(name: string): string | undefined {
    return this.#env[name];
  }

  entries(): Iterable<readonly [string, string]> {
    return Object.entries(this.#env).flatMap(([key, value]) =>
      value === undefined ? [] : ([[key, value] as const])
    );
  }
}

export function createNodeTerminalHost(options: NodeTerminalHostOptions = {}): TerminalHost {
  const nodeProcess = options.process ?? process;
  const inputStream = options.stdin ?? nodeProcess.stdin;
  const outputStream = options.stdout ?? nodeProcess.stdout;
  const inputSource = new NodeInput(inputStream);
  const stdin = new TerminalInputAuthority(inputSource, () => inputSource.dispose());
  const stdout = new NodeTerminalOutput(outputStream);
  const stderr = new NodeTerminalOutput(options.stderr ?? nodeProcess.stderr);
  const output = createTerminalHostOutputAuthority(stdout, stderr, options.id ?? 'node');
  const clock = new NodeClock();
  const getTerminalSize = (): TerminalSize => ({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24
  });
  const environment = options.env ?? nodeProcess.env;
  const colorDepth = nativeColorDepth(outputStream, environment);
  const resolverInput = {
    host: {
      runtime: 'node',
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: getTerminalSize().columns,
      rows: getTerminalSize().rows,
      rawInput: typeof inputStream.setRawMode === 'function',
      resizeEvents: typeof outputStream.on === 'function' && typeof outputStream.off === 'function',
      terminalProtocols: stdout.isTty(),
      ...(colorDepth === undefined ? {} : { colorDepth })
    },
    environment: { variables: environment },
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
    id: options.id ?? 'node',
    runtime: 'node',
    stdin,
    stdout,
    stderr,
    signals: new NodeSignals(nodeProcess, outputStream),
    clock,
    env: new ProcessEnvironment(environment),
    getTerminalSize,
    getCapabilities: (detectionOptions) => detector.detect(detectionOptions),
    beginSession: (sessionOptions) =>
      terminalState.beginLease(sessionOptions?.id ?? 'node-session', detector.current()),
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
    rawInputKnowledge: typeof inputStream.isRaw === 'boolean' ? 'observed' : 'library_known',
    verifyKeyboardProfile: (flags, context) => detector.verifyKeyboardProfile(flags, context.signal),
    ...(options.initialState === undefined ? {} : { initialState: options.initialState })
  });
  return host;
}

function nativeColorDepth(
  stream: NonNullable<NodeTerminalHostOptions['stdout']>,
  environment: Record<string, string | undefined>
): 1 | 4 | 8 | 24 | undefined {
  try {
    const depth = stream.getColorDepth?.(environment);
    return depth === 1 || depth === 4 || depth === 8 || depth === 24 ? depth : undefined;
  } catch {
    return undefined;
  }
}
