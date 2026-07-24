import { createStreamTerminalHost, runtimeInputSourceFromReadableStream } from './runtime-streams.ts';
import { denoSignalSubscriber } from './native-signals.ts';
import type { DenoTerminalHostOptions, RuntimeTerminalInputOptions, RuntimeTerminalOutputOptions, TerminalHost } from './types.ts';

interface DenoLike {
  readonly build?: { readonly os?: string };
  readonly stdin?: { readonly readable?: ReadableStream<Uint8Array>; readonly isTerminal?: () => boolean; setRaw?: (mode: boolean) => void };
  readonly stdout?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly stderr?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly env?: { toObject?: () => Record<string, string> };
  readonly consoleSize?: () => { readonly columns: number; readonly rows: number };
  addSignalListener?(signal: string, handler: () => void): void;
  removeSignalListener?(signal: string, handler: () => void): void;
}

export function createDenoTerminalHost(options: DenoTerminalHostOptions = {}): TerminalHost {
  const deno = denoGlobal();
  const subscribeSignals = options.subscribeSignals ?? denoSignalSubscriber(deno);
  const getNativeTerminalSize = options.stdout === undefined
    ? () => denoConsoleSize(deno)
    : undefined;
  return createStreamTerminalHost({
    id: options.id ?? 'deno',
    runtime: 'deno',
    ...(subscribeSignals === undefined ? {} : { subscribeSignals }),
    stdin: options.stdin ?? denoInputOptions(deno),
    stdout: options.stdout ?? denoOutputOptions(deno?.stdout),
    stderr: options.stderr ?? denoOutputOptions(deno?.stderr),
    ...(getNativeTerminalSize === undefined ? {} : { getTerminalSize: getNativeTerminalSize }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    ...(options.initialState === undefined ? {} : { initialState: options.initialState }),
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
