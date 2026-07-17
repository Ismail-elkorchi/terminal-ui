import { resolveTerminalCapabilities } from './capabilities.ts';
import { BasicTerminalSession } from './session.ts';
import { ObjectEnvironment, RuntimeClock, RuntimeInput, RuntimeOutput, RuntimeSignals } from './runtime-streams.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import { createTerminalHostOutputAuthority } from './ordered-output.ts';
import type {
  PtyTerminalHost,
  PtyTerminalHostOptions,
  RuntimeTerminalOutputOptions,
  TerminalOutput,
  TerminalSession,
  TerminalViewport
} from './types.ts';

class PtyOutput implements TerminalOutput {
  readonly #output: RuntimeOutput;

  constructor(
    options: RuntimeTerminalOutputOptions,
    private readonly viewport: () => TerminalViewport
  ) {
    this.#output = new RuntimeOutput(options);
  }

  get columns(): number {
    return this.viewport().columns;
  }

  get rows(): number {
    return this.viewport().rows;
  }

  write(chunk: string | Uint8Array): Promise<void> {
    return this.#output.write(chunk);
  }

  flush(): Promise<void> {
    return this.#output.flush();
  }

  isTty(): boolean {
    return this.#output.isTty();
  }
}

export function createPtyTerminalHost(options: PtyTerminalHostOptions = {}): PtyTerminalHost {
  let viewport = options.viewport ?? {
    columns: options.stdout?.columns ?? 80,
    rows: options.stdout?.rows ?? 24
  };
  const stdin = new RuntimeInput({ ...options.stdin, isTty: options.stdin?.isTty ?? true });
  const stdout = new PtyOutput({ ...options.stdout, isTty: options.stdout?.isTty ?? true }, () => viewport);
  const stderr = new PtyOutput({ ...options.stderr, isTty: options.stderr?.isTty ?? true }, () => viewport);
  const output = createTerminalHostOutputAuthority(stdout, stderr);
  const clock = new RuntimeClock();
  const runtime = options.runtime ?? 'node';
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime,
      inputIsTty: stdin.isTty(),
      outputIsTty: stdout.isTty(),
      columns: viewport.columns,
      rows: viewport.rows,
      rawInput: options.stdin?.setRawMode !== undefined,
      resizeEvents: options.subscribeSignals !== undefined,
      terminalProtocols: stdout.isTty()
    },
    environment: { variables: options.env ?? {} },
    ...(options.capabilities?.probes === undefined ? {} : { probes: options.capabilities.probes }),
    ...(options.capabilities?.colorDepth === undefined ? {} : { colorDepth: options.capabilities.colorDepth }),
    ...(options.capabilities?.overrides === undefined ? {} : { overrides: options.capabilities.overrides })
  });
  const env = new ObjectEnvironment(options.env ?? {});
  const setViewport = async (nextViewport: TerminalViewport): Promise<void> => {
    viewport = nextViewport;
    await options.resize?.(nextViewport);
  };

  const host: PtyTerminalHost = {
    id: options.id ?? 'pty',
    runtime,
    stdin,
    stdout,
    stderr,
    signals: new RuntimeSignals(options.subscribeSignals),
    clock,
    env,
    viewportControl: { setViewport },
    ...(options.observer === undefined ? {} : { observer: options.observer }),
    getViewport: () => viewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? `${options.id ?? 'pty'}-session`, host, capabilities)),
    write: output.write,
    flush: output.flush,
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
    }
  };
  return host;
}
