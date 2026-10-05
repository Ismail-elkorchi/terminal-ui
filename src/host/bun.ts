import { processSignalSubscriber } from './native-signals.ts';
import { NodeTerminalOutput } from './node-output.ts';
import {
  createStreamTerminalHost,
  runtimeInputSourceFromAsyncIterable,
} from './runtime-streams.ts';
import type {
  BunTerminalHostOptions,
  NodeReadableTerminalStream,
  NodeWritableTerminalStream,
  RuntimeTerminalInputOptions,
  TerminalHost,
} from './types.ts';

interface BunLike {
  readonly stdin?: { readonly isTTY?: boolean; setRawMode?: (enabled: boolean) => void };
}

export function createBunTerminalHost(options: BunTerminalHostOptions = {}): TerminalHost {
  const bun = bunGlobal();
  const processLike = processGlobal();
  const subscribeSignals = options.subscribeSignals ?? processSignalSubscriber(processLike);
  return createStreamTerminalHost({
    id: options.id ?? 'bun',
    runtime: 'bun',
    stdin: options.stdin ?? bunInputOptions(bun, processLike),
    ...(subscribeSignals === undefined ? {} : { subscribeSignals }),
    ...bunHostOutput('stdout', options.stdout, processLike?.stdout),
    ...bunHostOutput('stderr', options.stderr, processLike?.stderr),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    ...(options.cellPresentation === undefined ? {} : { cellPresentation: options.cellPresentation }),
    ...(options.initialState === undefined ? {} : { initialState: options.initialState }),
    ...optionalEnv(options.env ?? processLike?.env)
  });
}

function bunHostOutput(
  name: 'stdout' | 'stderr',
  configured: BunTerminalHostOptions[typeof name],
  processStream: NodeWritableTerminalStream | undefined
): Partial<Pick<import('./runtime-streams.ts').StreamTerminalHostOptions, 'stdout' | 'stderr' | 'stdoutOutput' | 'stderrOutput'>> {
  if (configured !== undefined) return { [name]: configured };
  if (processStream === undefined) return {};
  return { [`${name}Output`]: new NodeTerminalOutput(processStream) };
}

function bunInputOptions(
  bun: BunLike | undefined,
  processLike: ProcessLike | undefined
): RuntimeTerminalInputOptions {
  // Bun.stdin.stream() is cached and cancel() closes it permanently. The
  // Node-compatible stream has a non-destructive pause/detach lifecycle.
  const source = processLike?.stdin === undefined
    ? undefined
    : runtimeInputSourceFromAsyncIterable(processLike.stdin);
  const bunInput = bun?.stdin;
  const processInput = processLike?.stdin;
  const setRawMode = bunInput?.setRawMode === undefined
    ? processInput?.setRawMode === undefined
      ? undefined
      : (enabled: boolean): void => { processInput.setRawMode?.(enabled); }
    : (enabled: boolean): void => { bunInput.setRawMode?.(enabled); };
  return {
    isTty: bun?.stdin?.isTTY ?? processLike?.stdin?.isTTY ?? false,
    ...(source === undefined ? {} : { source }),
    ...(setRawMode === undefined ? {} : { setRawMode }),
    ...(bunInput?.setRawMode !== undefined || typeof processInput?.isRaw !== 'boolean'
      ? {} : { isRawModeEnabled: () => processInput.isRaw === true })
  };
}

interface ProcessLike {
  readonly stdin?: NodeReadableTerminalStream;
  readonly stdout?: NodeWritableTerminalStream;
  readonly stderr?: NodeWritableTerminalStream;
  readonly env?: Record<string, string>;
  on?(signal: string, handler: () => void): void;
  off?(signal: string, handler: () => void): void;
}

function bunGlobal(): BunLike | undefined {
  const value: unknown = Reflect.get(globalThis, 'Bun');
  return isBunLike(value) ? value : undefined;
}

function processGlobal(): ProcessLike | undefined {
  const value: unknown = Reflect.get(globalThis, 'process');
  return isProcessLike(value) ? value : undefined;
}

function optionalEnv(env: Record<string, string> | undefined): { readonly env?: Record<string, string> } {
  return env === undefined ? {} : { env };
}

function isBunLike(value: unknown): value is BunLike {
  return value !== null && typeof value === 'object';
}

function isProcessLike(value: unknown): value is ProcessLike {
  return value !== null && typeof value === 'object';
}
