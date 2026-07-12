export type {
  CapabilityConfidence,
  CapabilitySourceFact,
  CapabilitySourceKind,
  CapabilitySupport,
  CapabilityStatus,
  TerminalCapabilityName,
  TerminalCapabilityProfile,
  TerminalColorCapability,
  TerminalUnicodeCapability
} from './capability-types.ts';
export type {
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
  TerminalClock,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
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
  TerminalViewport,
  Unsubscribe
} from './types.ts';
export type {
  CapabilityOverride,
  CapabilityOverrides,
  EnvironmentFacts,
  ProtocolProbeFacts,
  TerminalCapabilityResolverInput,
  TerminalHostFacts
} from './capabilities.ts';
export type { MemoryTerminalHost } from './memory.ts';
export { createBunTerminalHost } from './bun.ts';
export { createDenoTerminalHost } from './deno.ts';
export { createMemoryTerminalHost } from './memory.ts';
export { createNodeTerminalHost } from './node.ts';
export { createPtyTerminalHost } from './pty.ts';
export { capabilityIsSupported, resolveTerminalCapabilities } from './capabilities.ts';

import { createBunTerminalHost } from './bun.ts';
import { createDenoTerminalHost } from './deno.ts';
import { createMemoryTerminalHost } from './memory.ts';
import { createNodeTerminalHost } from './node.ts';
import { createPtyTerminalHost } from './pty.ts';
import { restoreActiveTerminalSessions } from './session-registry.ts';
import type {
  CreateTerminalHostOptions,
  TerminalHost,
  TerminalRestoreResult
} from './types.ts';
import type { TerminalCapabilityProfile } from './capability-types.ts';

export function createTerminalHost(options?: CreateTerminalHostOptions): TerminalHost {
  if (options === undefined) return createDefaultTerminalHost();
  validateTerminalHostSelector(options);
  if ('adapter' in options) {
    return createPtyTerminalHost(options);
  }
  switch (options.runtime) {
    case 'node': return createNodeTerminalHost(options);
    case 'deno': return createDenoTerminalHost(options);
    case 'bun': return createBunTerminalHost(options);
    case 'memory': return createMemoryTerminalHost(options);
  }
}

function validateTerminalHostSelector(options: object): void {
  const adapter: unknown = Reflect.get(options, 'adapter');
  if (adapter !== undefined) {
    if (adapter !== 'pty') throw new TypeError('Unsupported terminal host adapter.');
    return;
  }
  const runtime: unknown = Reflect.get(options, 'runtime');
  if (runtime !== 'node' && runtime !== 'deno' && runtime !== 'bun' && runtime !== 'memory') {
    throw new TypeError('Terminal host options must select a runtime or PTY adapter.');
  }
}

function createDefaultTerminalHost(): TerminalHost {
  switch (defaultRuntimeTarget()) {
    case 'node': return createNodeTerminalHost();
    case 'deno': return createDenoTerminalHost();
    case 'bun': return createBunTerminalHost();
    case 'memory': return createMemoryTerminalHost();
  }
}

function defaultRuntimeTarget(): 'node' | 'deno' | 'bun' | 'memory' {
  if ('Deno' in globalThis) return 'deno';
  if ('Bun' in globalThis) return 'bun';
  return 'process' in globalThis ? 'node' : 'memory';
}

export async function detectTerminalCapabilities(host: TerminalHost): Promise<TerminalCapabilityProfile> {
  return host.getCapabilities();
}

export async function restoreTerminalState(host: TerminalHost): Promise<TerminalRestoreResult> {
  return restoreActiveTerminalSessions(host, 'disposed');
}
