import type { TerminalHost } from '../host/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TuiContext } from './types.ts';

export async function createTuiContext<TMessage>(
  host: TerminalHost,
  dispatch: (message: TMessage) => void,
  diagnostics: readonly TerminalDiagnostic[] = []
): Promise<TuiContext<TMessage>> {
  return {
    host,
    viewport: host.getViewport(),
    capabilities: await host.getCapabilities(),
    diagnostics,
    clock: host.clock,
    dispatch
  };
}
