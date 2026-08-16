import { Buffer } from 'node:buffer';
import { diagnostic } from '../diagnostics.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalProtocolSink } from './types.ts';

export interface ClipboardWritePolicy {
  readonly allowed: boolean;
  readonly maxBytes?: number;
}

export interface ClipboardWriteRejection {
  readonly status: 'rejected';
  readonly diagnostic: TerminalDiagnostic;
}

export type ClipboardWriteSequenceResult =
  | {
      readonly status: 'prepared';
      readonly sequence: string;
      readonly byteLength: number;
    }
  | ClipboardWriteRejection;

export type ClipboardWriteResult =
  | {
      readonly status: 'written';
      readonly assurance: 'sent';
      readonly byteLength: number;
    }
  | ClipboardWriteRejection;

export function createClipboardWriteSequence(
  text: string,
  policy: ClipboardWritePolicy
): ClipboardWriteSequenceResult {
  const maxBytes = clipboardMaxBytes(policy.maxBytes);
  if (!policy.allowed) return clipboardDenied();
  const sanitized = sanitizeTerminalText(text).text;
  const bytes = new TextEncoder().encode(sanitized);
  if (bytes.byteLength > maxBytes) {
    return {
      status: 'rejected',
      diagnostic: diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Clipboard payload exceeds configured policy.', {
        severity: 'warning',
        target: 'clipboard',
        data: { byteLength: bytes.byteLength, maxBytes }
      })
    };
  }
  return {
    status: 'prepared',
    sequence: `\u001B]52;c;${base64(bytes)}\u0007`,
    byteLength: bytes.byteLength
  };
}

export async function writeClipboardText(
  sink: TerminalProtocolSink,
  text: string,
  policy: ClipboardWritePolicy
): Promise<ClipboardWriteResult> {
  const preparation = createClipboardWriteSequence(text, policy);
  if (preparation.status === 'rejected') return preparation;
  await sink.write(preparation.sequence);
  return {
    status: 'written',
    assurance: 'sent',
    byteLength: preparation.byteLength,
  };
}

function clipboardDenied(): ClipboardWriteRejection {
  return {
    status: 'rejected',
    diagnostic: diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Clipboard write requires explicit caller policy.', {
      severity: 'warning',
      target: 'clipboard'
    })
  };
}

function clipboardMaxBytes(value: number | undefined): number {
  if (value === undefined) return 1_000_000;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Clipboard maxBytes must be a finite non-negative safe integer.');
  }
  return value;
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
