import { createStreamTerminalHost, runtimeInputSourceFromAsyncIterable } from './runtime-streams.ts';
import { NodeTerminalOutput } from './node-output.ts';
import type {
  BunTerminalHostOptions,
  NodeWritableTerminalStream,
  RuntimeTerminalInputOptions,
  TerminalHost
} from './types.ts';

interface BunLike {
  readonly stdin?: { readonly stream?: () => AsyncIterable<Uint8Array>; readonly isTTY?: boolean; setRawMode?: (enabled: boolean) => void };
}

export function createBunTerminalHost(options: BunTerminalHostOptions = {}): TerminalHost {
  const bun = bunGlobal();
  const processLike = processGlobal();
  return createStreamTerminalHost({
    id: options.id ?? 'bun',
    runtime: 'bun',
    stdin: options.stdin ?? bunInputOptions(bun, processLike),
    ...(options.subscribeSignals === undefined ? {} : { subscribeSignals: options.subscribeSignals }),
    ...bunHostOutput('stdout', options.stdout, processLike?.stdout),
    ...bunHostOutput('stderr', options.stderr, processLike?.stderr),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    ...optionalEnv(options.env ?? processLike?.env)
  });
}

function bunHostOutput(
  name: 'stdout' | 'stderr',
  configured: BunTerminalHostOptions[typeof name],
  processStream: ProcessOutputLike | undefined
): Partial<Pick<import('./runtime-streams.ts').StreamTerminalHostOptions, 'stdout' | 'stderr' | 'stdoutOutput' | 'stderrOutput'>> {
  if (configured !== undefined) return { [name]: configured };
  if (processStream === undefined) return {};
  return { [`${name}Output`]: new NodeTerminalOutput(processStream) };
}

function bunInputOptions(
  bun: BunLike | undefined,
  processLike: ProcessLike | undefined
): RuntimeTerminalInputOptions {
  const source = bun?.stdin?.stream?.() ?? processLike?.stdin;
  const setRawMode = bun?.stdin?.setRawMode ?? processLike?.stdin?.setRawMode;
  return {
    isTty: bun?.stdin?.isTTY ?? processLike?.stdin?.isTTY ?? false,
    ...(source === undefined ? {} : { source: runtimeInputSourceFromAsyncIterable(source) }),
    ...(setRawMode === undefined ? {} : { setRawMode })
  };
}

interface ProcessLike {
  readonly stdin?: AsyncIterable<Uint8Array> & { readonly isTTY?: boolean; setRawMode?: (enabled: boolean) => void };
  readonly stdout?: ProcessOutputLike;
  readonly stderr?: ProcessOutputLike;
  readonly env?: Record<string, string>;
}

type ProcessOutputLike = NodeWritableTerminalStream;

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
