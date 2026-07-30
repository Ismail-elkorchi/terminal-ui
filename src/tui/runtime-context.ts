import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalHost, TerminalSize } from '../host/index.ts';
import type { TuiContext } from './types.ts';

export function createRuntimeContextFactory(
  host: TerminalHost,
  resolvedCapabilities?: TerminalCapabilityProfile
): (
  terminalSize: TerminalSize,
  diagnostics: readonly DiagnosticOccurrence[]
) => Promise<TuiContext> {
  let capabilities = resolvedCapabilities === undefined
    ? undefined
    : Promise.resolve(resolvedCapabilities);

  return async (terminalSize, diagnostics) => {
    capabilities ??= host.getCapabilities();
    return {
      terminalSize,
      capabilities: await capabilities,
      diagnostics,
      clock: host.clock
    };
  };
}
