import process from 'node:process';
import { resolveTerminalCapabilities } from './capabilities.ts';
import { NodeInput } from './node-input.ts';
import { BasicTerminalSession } from './session.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  NodeTerminalHostOptions,
  NodeTerminalSignal,
  NodeWritableTerminalStream,
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalSession,
  TerminalSignal,
  TerminalSignalSource,
  TerminalViewport,
  Unsubscribe
} from './types.ts';

class NodeOutput implements TerminalOutput {
  constructor(private readonly stream: NodeWritableTerminalStream) {}

  get columns(): number | undefined {
    return this.stream.columns;
  }

  get rows(): number | undefined {
    return this.stream.rows;
  }

  write(chunk: string | Uint8Array): void {
    this.stream.write(chunk);
  }

  isTty(): boolean {
    return this.stream.isTTY === true;
  }
}

class NodeSignals implements TerminalSignalSource {
  constructor(private readonly source: Pick<NonNullable<NodeTerminalHostOptions['process']>, 'on' | 'off'> = process) {}

  subscribe(listener: (signal: TerminalSignal) => void): Unsubscribe {
    const signals: NodeTerminalSignal[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGWINCH'];
    const handler = (signal: NodeTerminalSignal): void => {
      const mapped = terminalSignalFromNodeSignal(signal);
      if (mapped !== undefined) listener(mapped);
    };
    for (const signal of signals) this.source.on(signal, handler);
    return () => {
      for (const signal of signals) this.source.off(signal, handler);
    };
  }
}

function terminalSignalFromNodeSignal(signal: NodeTerminalSignal): TerminalSignal | undefined {
  switch (signal) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGHUP':
      return signal;
    case 'SIGWINCH':
      return 'resize';
    default:
      return undefined;
  }
}

class NodeClock implements TerminalClock {
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

class ProcessEnvironment implements TerminalEnvironment {
  constructor(private readonly env: Record<string, string | undefined>) {}

  get(name: string): string | undefined {
    return this.env[name];
  }

  entries(): Iterable<readonly [string, string]> {
    return Object.entries(this.env).flatMap(([key, value]) =>
      value === undefined ? [] : ([[key, value] as const])
    );
  }
}

export function createNodeTerminalHost(options: NodeTerminalHostOptions = {}): TerminalHost {
  const nodeProcess = options.process ?? process;
  const inputStream = options.stdin ?? nodeProcess.stdin;
  const stdin = new NodeInput(inputStream);
  const stdout = new NodeOutput(options.stdout ?? nodeProcess.stdout);
  const stderr = new NodeOutput(options.stderr ?? nodeProcess.stderr);
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
      rawInput: typeof inputStream.setRawMode === 'function'
    },
    environment: { variables: options.env ?? nodeProcess.env }
  });
  const host: TerminalHost = {
    id: options.id ?? 'node',
    runtime: 'node',
    stdin,
    stdout,
    stderr,
    signals: new NodeSignals(nodeProcess),
    clock,
    env: new ProcessEnvironment(options.env ?? nodeProcess.env),
    getViewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? 'node-session', host, capabilities)),
    write: (output: TerminalOutputChunk): Promise<void> => {
      if (output.text !== undefined) stdout.write(output.text);
      if (output.bytes !== undefined) stdout.write(output.bytes);
      return Promise.resolve();
    },
    flush: () => Promise.resolve(),
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
      await stdin.dispose();
    }
  };
  return host;
}
