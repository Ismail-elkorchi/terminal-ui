import process from 'node:process';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { NodeTerminalOutput } from './node-output.ts';
import { createTerminalHostOutputAuthority } from './ordered-output.ts';
import { NodeInput } from './node-input.ts';
import { BasicTerminalSession } from './session.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  NodeTerminalHostOptions,
  NodeTerminalSignal,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalSession,
  TerminalSignal,
  TerminalSignalSource,
  TerminalViewport,
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
    this.#output?.on?.('resize', resize);
    return () => {
      for (const signal of signals) this.#source.off(signal, handler);
      this.#output?.off?.('resize', resize);
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
  const stdin = new NodeInput(inputStream);
  const stdout = new NodeTerminalOutput(outputStream);
  const stderr = new NodeTerminalOutput(options.stderr ?? nodeProcess.stderr);
  const output = createTerminalHostOutputAuthority(stdout, stderr);
  const clock = new NodeClock();
  const getViewport = (): TerminalViewport => ({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24
  });
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'node',
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: getViewport().columns,
      rows: getViewport().rows,
      rawInput: typeof inputStream.setRawMode === 'function',
      resizeEvents: typeof outputStream.on === 'function' && typeof outputStream.off === 'function',
      terminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? nodeProcess.env },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth })
  });
  const host: TerminalHost = {
    id: options.id ?? 'node',
    runtime: 'node',
    stdin,
    stdout,
    stderr,
    signals: new NodeSignals(nodeProcess, outputStream),
    clock,
    env: new ProcessEnvironment(options.env ?? nodeProcess.env),
    getViewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? 'node-session', host, capabilities)),
    write: output.write,
    flush: output.flush,
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
      await stdin.dispose();
    }
  };
  return host;
}
