import type { TerminalHost } from '../host/index.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { TuiContext } from './types.ts';

export async function createTuiContext(
  host: TerminalHost,
  diagnostics: readonly DiagnosticOccurrence[] = []
): Promise<TuiContext> {
  return {
    terminalSize: host.getTerminalSize(),
    capabilities: await host.getCapabilities(),
    diagnostics,
    clock: host.clock
  };
}
