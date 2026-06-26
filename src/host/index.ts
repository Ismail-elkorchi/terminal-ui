export type {
  CapabilitySupport,
  BunTerminalHostOptions,
  CreateTerminalHostOptions,
  ControlledTerminalClock,
  DenoTerminalHostOptions,
  MemoryTerminalHostOptions,
  MouseReportingMode,
  NodeProcessLike,
  NodeReadableTerminalStream,
  NodeTerminalHostOptions,
  NodeTerminalSignal,
  NodeWritableTerminalStream,
  PtyTerminalHost,
  PtyTerminalHostOptions,
  RuntimeInputSource,
  RuntimeTerminalInputOptions,
  RuntimeTerminalOutputOptions,
  TerminalCapabilities,
  TerminalClock,
  TerminalColorCapability,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalSessionOptions,
  TerminalSignal,
  TerminalSignalSource,
  TerminalStateChange,
  TerminalStateSnapshot,
  TerminalUnicodeCapability,
  TerminalViewport,
  Unsubscribe
} from './types.ts';
export type { MemoryTerminalHost } from './memory.ts';
export type { TerminalCapabilityInput } from './capabilities.ts';
export { createBunTerminalHost } from './bun.ts';
export { createDenoTerminalHost } from './deno.ts';
export { createMemoryTerminalHost } from './memory.ts';
export { createNodeTerminalHost } from './node.ts';
export { createPtyTerminalHost } from './pty.ts';
export { createCapabilities } from './capabilities.ts';

import { createBunTerminalHost } from './bun.ts';
import { createDenoTerminalHost } from './deno.ts';
import { createMemoryTerminalHost } from './memory.ts';
import { createNodeTerminalHost } from './node.ts';
import { createPtyTerminalHost } from './pty.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  BunTerminalHostOptions,
  CreateTerminalHostOptions,
  DenoTerminalHostOptions,
  MemoryTerminalHostOptions,
  PtyTerminalHostOptions,
  TerminalCapabilities,
  TerminalHost,
  TerminalRestoreResult
} from './types.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function createTerminalHost(options: CreateTerminalHostOptions = {}): TerminalHost {
  if ('adapter' in options) {
    return createPtyTerminalHost(withoutAdapter(options));
  }
  const runtime = options.runtime ?? defaultRuntimeTarget();
  if (runtime === 'node') {
    return createNodeTerminalHost(withoutRuntime(options));
  }
  if (runtime === 'deno') {
    return createDenoTerminalHost(withoutRuntime(options) as DenoTerminalHostOptions);
  }
  if (runtime === 'bun') {
    return createBunTerminalHost(withoutRuntime(options) as BunTerminalHostOptions);
  }
  return createMemoryTerminalHost(withoutRuntime(options) as MemoryTerminalHostOptions);
}

function withoutRuntime(options: CreateTerminalHostOptions): Omit<CreateTerminalHostOptions, 'runtime'> {
  const rest: Mutable<Partial<CreateTerminalHostOptions>> = { ...options };
  delete rest.runtime;
  return rest;
}

function withoutAdapter(options: PtyTerminalHostOptions & { readonly adapter: 'pty' }): PtyTerminalHostOptions {
  const rest: Mutable<Partial<PtyTerminalHostOptions & { readonly adapter: 'pty' }>> = { ...options };
  delete rest.adapter;
  return rest;
}

function defaultRuntimeTarget(): 'node' | 'deno' | 'bun' | 'memory' {
  if ('Deno' in globalThis) return 'deno';
  if ('Bun' in globalThis) return 'bun';
  return 'node';
}

export async function detectTerminalCapabilities(host: TerminalHost): Promise<TerminalCapabilities> {
  return host.getCapabilities();
}

export async function restoreTerminalState(host: TerminalHost): Promise<TerminalRestoreResult> {
  return restoreActiveTerminalSessions(host, 'disposed');
}
