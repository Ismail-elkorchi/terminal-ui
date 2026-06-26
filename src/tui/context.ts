import type { TerminalHost } from '../host/index.ts';
import type { TuiContext } from './types.ts';

export async function createTuiContext<TMessage>(
  host: TerminalHost,
  dispatch: (message: TMessage) => void
): Promise<TuiContext<TMessage>> {
  return {
    host,
    viewport: host.getViewport(),
    capabilities: await host.getCapabilities(),
    clock: host.clock,
    dispatch
  };
}
