import { createStreamTerminalHost } from './runtime-streams.ts';
import type { BunTerminalHostOptions, RuntimeTerminalInputOptions, RuntimeTerminalOutputOptions, TerminalHost } from './types.ts';

interface BunLike {
  readonly stdin?: { readonly stream?: () => AsyncIterable<Uint8Array>; readonly isTTY?: boolean; setRawMode?: (enabled: boolean) => void };
  readonly stdout?: { write?: (chunk: string | Uint8Array) => void | Promise<void>; readonly isTTY?: boolean; readonly columns?: number; readonly rows?: number };
  readonly stderr?: { write?: (chunk: string | Uint8Array) => void | Promise<void>; readonly isTTY?: boolean; readonly columns?: number; readonly rows?: number };
}

export function createBunTerminalHost(options: BunTerminalHostOptions = {}): TerminalHost {
  const bun = bunGlobal();
  const processLike = processGlobal();
  return createStreamTerminalHost({
    id: options.id ?? 'bun',
    runtime: 'bun',
    stdin: options.stdin ?? bunInputOptions(bun, processLike),
    stdout: options.stdout ?? bunOutputOptions(bun?.stdout, processLike?.stdout),
    stderr: options.stderr ?? bunOutputOptions(bun?.stderr, processLike?.stderr),
    ...optionalEnv(options.env ?? processLike?.env)
  });
}

function bunInputOptions(
  bun: BunLike | undefined,
  processLike: ProcessLike | undefined
): RuntimeTerminalInputOptions {
  const source = bun?.stdin?.stream?.() ?? processLike?.stdin;
  const setRawMode = bun?.stdin?.setRawMode ?? processLike?.stdin?.setRawMode;
  return {
    isTty: bun?.stdin?.isTTY ?? processLike?.stdin?.isTTY ?? false,
    ...(source === undefined ? {} : { source }),
    ...(setRawMode === undefined ? {} : { setRawMode })
  };
}

function bunOutputOptions(
  bunStream: BunLike['stdout'] | BunLike['stderr'] | undefined,
  processStream: ProcessOutputLike | undefined
): RuntimeTerminalOutputOptions {
  const write = bunStream === undefined
    ? processStream === undefined ? undefined : processStream.write.bind(processStream)
    : bunStream.write;
  const columns = bunStream?.columns ?? processStream?.columns;
  const rows = bunStream?.rows ?? processStream?.rows;
  return {
    isTty: bunStream?.isTTY ?? processStream?.isTTY ?? false,
    ...(write === undefined ? {} : { write }),
    ...(columns === undefined ? {} : { columns }),
    ...(rows === undefined ? {} : { rows })
  };
}

interface ProcessLike {
  readonly stdin?: AsyncIterable<Uint8Array> & { readonly isTTY?: boolean; setRawMode?: (enabled: boolean) => void };
  readonly stdout?: ProcessOutputLike;
  readonly stderr?: ProcessOutputLike;
  readonly env?: Record<string, string>;
}

interface ProcessOutputLike {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
  write(chunk: string | Uint8Array): void | Promise<void>;
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
