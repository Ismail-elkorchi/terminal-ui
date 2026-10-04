import { defineTextPresentation } from '../text/presentation.ts';
import type { TextPresentation } from '../text/presentation.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { TerminalCapabilityProfile } from '../host/capability-types.ts';
import type { TerminalHost } from '../host/types.ts';
import type { TuiContext } from './types.ts';

export function createRuntimeContextFactory(
  host: TerminalHost,
  resolvedCapabilities?: TerminalCapabilityProfile,
  textPresentation?: TextPresentation,
): RuntimeContextFactory {
  const presentation = textPresentation === undefined ? undefined : defineTextPresentation(textPresentation);
  let capabilities = resolvedCapabilities === undefined
    ? undefined
    : Promise.resolve(resolvedCapabilities);

  return {
    async create(terminalSize, diagnostics) {
      capabilities ??= host.getCapabilities();
      return {
        terminalSize,
        textPresentation: presentation,
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
