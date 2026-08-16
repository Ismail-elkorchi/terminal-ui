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
      readonly status: 'copied';
      readonly selection: Extract<ResolveSelectedTextResult, { readonly status: 'resolved' }>;
      readonly clipboard: Extract<ClipboardWriteResult, { readonly status: 'written' }>;
    }
  | {
      readonly status: 'unavailable';
      readonly selection?: ResolveSelectedTextResult;
      readonly diagnostic: TerminalDiagnostic;
    };

export async function copySelectedTextToClipboard(input: CopySelectedTextInput): Promise<CopySelectedTextResult> {
  const selection = resolveSelectedText(input);
  if (selection.status === 'unavailable') {
    return { status: 'unavailable', selection, diagnostic: selection.diagnostic };
  }
  const capabilities = await input.host.getCapabilities();
  if (
    capabilities.clipboardWrite.support === 'unsupported'
    || capabilities.clipboardWrite.availability !== 'available'
  ) {
    return {
      status: 'unavailable',
      selection,
      diagnostic: diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Terminal clipboard write is unavailable.', {
        severity: 'warning',
        target: 'clipboard',
        data: {
          support: capabilities.clipboardWrite.support,
          availability: capabilities.clipboardWrite.availability,
          diagnostics: capabilities.clipboardWrite.diagnostics.map((item) => item.message)
        }
      })
    };
  }
  const clipboard = await writeClipboardText({
    write: async (sequence) => {
      requireCommittedTerminalWrite(await input.host.write({ text: sequence }));
    }
  }, selection.text, input.policy);
  if (clipboard.status === 'rejected') {
    return { status: 'unavailable', selection, diagnostic: clipboard.diagnostic };
  }
  return { status: 'copied', selection, clipboard };
}
