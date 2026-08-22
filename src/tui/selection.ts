import { diagnostic } from '../diagnostics.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import { writeClipboardText } from '../protocol/index.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalHost } from '../host/index.ts';
import type { ClipboardWritePolicy, ClipboardWriteResult } from '../protocol/index.ts';
import { decodeClipboardWritePolicy } from '../protocol/clipboard.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

export interface SelectedText {
  readonly sourceId: string;
  readonly text: string;
  readonly label?: string;
}

export interface CopySelectedTextInput {
  readonly policy: ClipboardWritePolicy;
  readonly selection?: SelectedText;
}

export type CopySelectedTextResult =
  | {
      readonly status: 'copied';
      readonly selection: SelectedText;
      readonly clipboard: Extract<ClipboardWriteResult, { readonly status: 'written' }>;
    }
  | {
      readonly status: 'unavailable';
      readonly selection?: SelectedText;
      readonly diagnostic: TerminalDiagnostic;
    };

export function prepareCopySelectedTextInput(value: unknown): CopySelectedTextInput {
  if (!isNonArrayObject(value)) {
    throw new TypeError('Copy selected text input must be an object.');
  }
  const selection = prepareSelectedText(value['selection']);
  return Object.freeze({
    policy: decodeClipboardWritePolicy(value['policy']),
    ...(selection === undefined ? {} : { selection }),
  });
}

export async function copySelectedTextToClipboard(
  host: TerminalHost,
  capabilities: TerminalCapabilityProfile,
  input: CopySelectedTextInput,
  signal?: AbortSignal,
): Promise<CopySelectedTextResult> {
  const selection = input.selection;
  if (selection === undefined) return unavailableSelection();
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
      requireCommittedTerminalWrite(await host.write(
        { text: sequence },
        signal === undefined ? {} : { signal },
      ));
    }
  }, selection.text, input.policy);
  if (clipboard.status === 'rejected') {
    return { status: 'unavailable', selection, diagnostic: clipboard.diagnostic };
  }
  return { status: 'copied', selection, clipboard };
}

export function suspendedClipboardSelection(
  selection: SelectedText | undefined,
): CopySelectedTextResult {
  return {
    status: 'unavailable',
    ...(selection === undefined ? {} : { selection }),
    diagnostic: diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      'Terminal clipboard output is unavailable while TUI output is suspended.',
      { severity: 'warning', target: 'clipboard' },
    ),
  };
}

function prepareSelectedText(value: unknown): SelectedText | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('Selected text must be an object.');
  if (typeof value['sourceId'] !== 'string' || value['sourceId'].trim() === '') {
    throw new TypeError('Selected text sourceId must be a non-empty string.');
  }
  if (typeof value['text'] !== 'string') throw new TypeError('Selected text must be a string.');
  if (value['label'] !== undefined && typeof value['label'] !== 'string') {
    throw new TypeError('Selected text label must be a string.');
  }
  const text = sanitizeTerminalText(value['text']).text;
  if (text.length === 0) return undefined;
  return Object.freeze({
    sourceId: value['sourceId'],
    text,
    ...(value['label'] === undefined
      ? {}
      : { label: sanitizeTerminalText(value['label']).text }),
  });
}

function unavailableSelection(): CopySelectedTextResult {
  return {
    status: 'unavailable',
    diagnostic: diagnostic('SELECTION_UNAVAILABLE', 'No caller-controlled text selection is active.', {
      severity: 'info',
      target: 'selection',
    }),
  };
}
