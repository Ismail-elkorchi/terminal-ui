export type {
  CapabilitySourceFact,
  CapabilitySourceKind,
  CapabilitySupport,
  HostFeatureAvailability,
  RuntimeTarget,
  TerminalCapabilityName,
  TerminalCapabilityProfile,
  TerminalColorCapability,
  TerminalFeatureSupport,
  TerminalUnicodeCapability
} from './capability-types.ts';
export { terminalCapabilityNames } from './capability-types.ts';
export type {
  BunTerminalHostOptions,
  CreateTerminalHostOptions,
  ControlledTerminalClock,
  DenoTerminalHostOptions,
  MemoryTerminalHostOptions,
  MouseReportingMode,
  MouseReportingEncoding,
  MouseReportingState,
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
  TerminalCapabilityDetectionOptions,
  TerminalActiveCapabilityProbe,
  TerminalEnvironment,
  TerminalHost,
  TerminalInput,
  TerminalInputChunk,
  TerminalInputReadOptions,
  TerminalInitialState,
  TerminalOutput,
  TerminalOutputChunk,
  TerminalOperationAssurance,
  TerminalOperationContext,
  TerminalOperationOutcome,
  TerminalRestoreOptions,
  TerminalRestoreReason,
  TerminalRestoreResult,
  TerminalSession,
  TerminalSessionOptions,
  TerminalSignal,
  TerminalSignalSource,
  TerminalStateChange,
  TerminalStateKnowledge,
  TerminalStateProvenanceSnapshot,
  TerminalStateSnapshot,
  TerminalSize,
  TerminalWriteReceipt,
  Unsubscribe
} from './types.ts';
export type {
  CapabilityOverride,
  CapabilityOverrides,
  EnvironmentFacts,
  ProtocolProbeFacts,
  TerminalCapabilityConfiguration,
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
export {
  committedTerminalWrite,
  failedTerminalWrite,
  indeterminateTerminalWrite
} from './write-receipt.ts';

import { createBunTerminalHost } from './bun.ts';
import { createDenoTerminalHost } from './deno.ts';
import { createMemoryTerminalHost } from './memory.ts';
import { createNodeTerminalHost } from './node.ts';
import { createPtyTerminalHost } from './pty.ts';
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
    const { adapter, ...hostOptions } = options;
    void adapter;
    return createPtyTerminalHost(hostOptions);
  }
  switch (options.runtime) {
    case 'node': {
      const { runtime, ...hostOptions } = options;
      void runtime;
      return createNodeTerminalHost(hostOptions);
    }
    case 'deno': {
      const { runtime, ...hostOptions } = options;
      void runtime;
      return createDenoTerminalHost(hostOptions);
    }
    case 'bun': {
      const { runtime, ...hostOptions } = options;
      void runtime;
      return createBunTerminalHost(hostOptions);
    }
    case 'memory': {
      const { runtime, ...hostOptions } = options;
      void runtime;
      return createMemoryTerminalHost(hostOptions);
    }
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
  return host.restoreTerminalState('disposed');
}
