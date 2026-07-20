import { diagnostic } from '../diagnostics.ts';
import { resolveSelectedText } from '../interaction/selection.ts';
import { writeClipboardText } from '../protocol/index.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  ResolveSelectedTextInput,
  ResolveSelectedTextResult
} from '../interaction/selection.ts';
import type { TerminalHost } from '../host/index.ts';
import type { ClipboardWritePolicy, ClipboardWriteResult } from '../protocol/index.ts';

export interface CopySelectedTextInput extends ResolveSelectedTextInput {
  readonly host: TerminalHost;
  readonly policy: ClipboardWritePolicy;
}

export type CopySelectedTextResult =
  | {
      readonly ok: true;
      readonly selection: Extract<ResolveSelectedTextResult, { readonly ok: true }>;
      readonly clipboard: Extract<ClipboardWriteResult, { readonly ok: true }>;
    }
  | {
      readonly ok: false;
      readonly selection?: ResolveSelectedTextResult;
      readonly diagnostic: TerminalDiagnostic;
    };

export async function copySelectedTextToClipboard(input: CopySelectedTextInput): Promise<CopySelectedTextResult> {
  const selection = resolveSelectedText(input);
  if (!selection.ok) return { ok: false, selection, diagnostic: selection.diagnostic };
  const capabilities = await input.host.getCapabilities();
  if (capabilities.clipboard.support !== 'supported' || capabilities.clipboard.availability !== 'available') {
    return {
      ok: false,
      selection,
      diagnostic: diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Terminal clipboard write is unavailable.', {
        severity: 'warning',
        target: 'clipboard',
        data: {
          support: capabilities.clipboard.support,
          availability: capabilities.clipboard.availability,
          diagnostics: capabilities.clipboard.diagnostics.map((item) => item.message)
        }
      })
    };
  }
  const clipboard = await writeClipboardText({
    write: async (sequence) => {
      requireCommittedTerminalWrite(await input.host.write({ text: sequence }));
    }
  }, selection.text, input.policy);
  if (!clipboard.ok) return { ok: false, selection, diagnostic: clipboard.diagnostic };
  return { ok: true, selection, clipboard };
}
