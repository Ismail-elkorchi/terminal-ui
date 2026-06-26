import { createCapabilities } from './capabilities.ts';
import { BasicTerminalSession } from './session.ts';
import { ObjectEnvironment, RuntimeClock, RuntimeInput, RuntimeSignals } from './runtime-streams.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  PtyTerminalHost,
  PtyTerminalHostOptions,
  RuntimeTerminalOutputOptions,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalSession,
  TerminalViewport
} from './types.ts';

class PtyOutput implements TerminalOutput {
  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;

  constructor(
    private readonly options: RuntimeTerminalOutputOptions,
    private readonly viewport: () => TerminalViewport
  ) {}

  get columns(): number {
    return this.viewport().columns;
  }

  get rows(): number {
    return this.viewport().rows;
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
    return this.options.isTty ?? true;
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
  const clock = new RuntimeClock();
  const runtime = options.runtime ?? 'node';
  const capabilities = createCapabilities({
    runtime,
    inputIsTty: stdin.isTty(),
    outputIsTty: stdout.isTty(),
    columns: viewport.columns,
    rawInput: options.stdin?.setRawMode !== undefined
  });
  const env = new ObjectEnvironment(options.env ?? {});

  const host: PtyTerminalHost = {
    id: options.id ?? 'pty',
    runtime,
    stdin,
    stdout,
    stderr,
    signals: new RuntimeSignals(options.subscribeSignals),
    clock,
    env,
    getViewport: () => viewport,
    getCapabilities: () => Promise.resolve(capabilities),
    beginSession: (sessionOptions): Promise<TerminalSession> =>
      Promise.resolve(new BasicTerminalSession(sessionOptions?.id ?? `${options.id ?? 'pty'}-session`, host, capabilities)),
    write: async (output: TerminalOutputChunk) => {
      if (output.text !== undefined) await stdout.write(output.text);
      if (output.bytes !== undefined) await stdout.write(output.bytes);
    },
    flush: () => Promise.resolve(),
    dispose: async () => {
      await restoreActiveTerminalSessions(host, 'disposed');
    },
    async resize(nextViewport) {
      viewport = nextViewport;
      await options.resize?.(nextViewport);
    }
  };
  return host;
}
