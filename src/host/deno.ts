import { createStreamTerminalHost, runtimeInputSourceFromReadableStream } from './runtime-streams.ts';
import type { DenoTerminalHostOptions, RuntimeTerminalInputOptions, RuntimeTerminalOutputOptions, TerminalHost } from './types.ts';

interface DenoLike {
  readonly stdin?: { readonly readable?: ReadableStream<Uint8Array>; readonly isTerminal?: () => boolean; setRaw?: (mode: boolean) => void };
  readonly stdout?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly stderr?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly env?: { toObject?: () => Record<string, string> };
  readonly consoleSize?: () => { readonly columns: number; readonly rows: number };
}

export function createDenoTerminalHost(options: DenoTerminalHostOptions = {}): TerminalHost {
  const deno = denoGlobal();
  const getNativeViewport = options.stdout === undefined
    ? () => denoConsoleSize(deno)
    : undefined;
  return createStreamTerminalHost({
    id: options.id ?? 'deno',
    runtime: 'deno',
    ...(options.subscribeSignals === undefined ? {} : { subscribeSignals: options.subscribeSignals }),
    stdin: options.stdin ?? denoInputOptions(deno),
    stdout: options.stdout ?? denoOutputOptions(deno?.stdout),
    stderr: options.stderr ?? denoOutputOptions(deno?.stderr),
    ...(getNativeViewport === undefined ? {} : { getViewport: getNativeViewport }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    ...optionalEnv(options.env ?? denoEnvironment(deno))
  });
}

function denoInputOptions(deno: DenoLike | undefined): RuntimeTerminalInputOptions {
  return {
    isTty: deno?.stdin?.isTerminal?.() ?? false,
    ...(deno?.stdin?.readable === undefined ? {} : { source: runtimeInputSourceFromReadableStream(deno.stdin.readable) }),
    ...(deno?.stdin?.setRaw === undefined ? {} : { setRawMode: (enabled: boolean) => deno.stdin?.setRaw?.(enabled) })
  };
}

function denoOutputOptions(
  stream: DenoLike['stdout'] | DenoLike['stderr'] | undefined
): RuntimeTerminalOutputOptions {
  return {
    isTty: stream?.isTerminal?.() ?? false,
    ...(stream?.writable === undefined ? {} : { writable: stream.writable })
  };
}

function denoConsoleSize(deno: DenoLike | undefined): { readonly columns: number; readonly rows: number } | undefined {
  if (deno?.stdout?.isTerminal?.() !== true) return undefined;
  try {
    return deno.consoleSize?.();
  } catch {
    return undefined;
  }
}

function optionalEnv(env: Record<string, string> | undefined): { readonly env?: Record<string, string> } {
  return env === undefined ? {} : { env };
}

function denoGlobal(): DenoLike | undefined {
  const value: unknown = Reflect.get(globalThis, 'Deno');
  return isDenoLike(value) ? value : undefined;
}

function denoEnvironment(deno: DenoLike | undefined): Record<string, string> | undefined {
  try {
    return deno?.env?.toObject?.();
  } catch {
    return undefined;
  }
}

function isDenoLike(value: unknown): value is DenoLike {
  return value !== null && typeof value === 'object';
}
