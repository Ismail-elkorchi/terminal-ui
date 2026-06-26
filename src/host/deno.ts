import { createStreamTerminalHost } from './runtime-streams.ts';
import type { DenoTerminalHostOptions, RuntimeTerminalInputOptions, RuntimeTerminalOutputOptions, TerminalHost } from './types.ts';

interface DenoLike {
  readonly stdin?: { readonly readable?: ReadableStream<Uint8Array>; readonly isTerminal?: () => boolean; setRaw?: (mode: boolean) => void };
  readonly stdout?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly stderr?: { readonly writable?: WritableStream<Uint8Array>; readonly isTerminal?: () => boolean };
  readonly env?: { toObject?: () => Record<string, string> };
}

export function createDenoTerminalHost(options: DenoTerminalHostOptions = {}): TerminalHost {
  const deno = denoGlobal();
  return createStreamTerminalHost({
    id: options.id ?? 'deno',
    runtime: 'deno',
    stdin: options.stdin ?? denoInputOptions(deno),
    stdout: options.stdout ?? denoOutputOptions(deno?.stdout),
    stderr: options.stderr ?? denoOutputOptions(deno?.stderr),
    ...optionalEnv(options.env ?? denoEnvironment(deno))
  });
}

function denoInputOptions(deno: DenoLike | undefined): RuntimeTerminalInputOptions {
  return {
    isTty: deno?.stdin?.isTerminal?.() ?? false,
    ...(deno?.stdin?.readable === undefined ? {} : { source: deno.stdin.readable }),
    ...(deno?.stdin?.setRaw === undefined ? {} : { setRawMode: (enabled: boolean) => deno.stdin?.setRaw?.(enabled) })
  };
}

function denoOutputOptions(stream: DenoLike['stdout'] | DenoLike['stderr'] | undefined): RuntimeTerminalOutputOptions {
  return {
    isTty: stream?.isTerminal?.() ?? false,
    ...(stream?.writable === undefined ? {} : { writable: stream.writable })
  };
}

function optionalEnv(env: Record<string, string> | undefined): { readonly env?: Record<string, string> } {
  return env === undefined ? {} : { env };
}

function denoGlobal(): DenoLike | undefined {
  return (globalThis as unknown as { readonly Deno?: DenoLike }).Deno;
}

function denoEnvironment(deno: DenoLike | undefined): Record<string, string> | undefined {
  try {
    return deno?.env?.toObject?.();
  } catch {
    return undefined;
  }
}
