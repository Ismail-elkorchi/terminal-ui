import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalHost, TerminalSize } from '../host/index.ts';
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
