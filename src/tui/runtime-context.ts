import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { TerminalCapabilityProfile } from '../host/capability-types.ts';
import type { TerminalHost } from '../host/types.ts';
import type { TuiContext } from './types.ts';

export function createRuntimeContextFactory(
  host: TerminalHost,
  resolvedCapabilities?: TerminalCapabilityProfile
): RuntimeContextFactory {
  let capabilities = resolvedCapabilities === undefined
    ? undefined
    : Promise.resolve(resolvedCapabilities);

  return {
    async create(terminalSize, diagnostics) {
      capabilities ??= host.getCapabilities();
      return {
        terminalSize,
        capabilities: await capabilities,
        diagnostics,
        clock: host.clock
      };
    },
    replace(nextCapabilities) {
      capabilities = Promise.resolve(nextCapabilities);
    }
  };
}

interface RuntimeContextFactory {
  create(terminalSize: TerminalSize, diagnostics: readonly DiagnosticOccurrence[]): Promise<TuiContext>;
  replace(capabilities: TerminalCapabilityProfile): void;
}
