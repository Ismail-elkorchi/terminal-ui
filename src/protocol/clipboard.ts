import { Buffer } from 'node:buffer';
import { diagnostic } from '../diagnostics.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalProtocolSink } from './types.ts';

export interface ClipboardWritePolicy {
  readonly allow: boolean;
  readonly maxBytes?: number;
}

export type ClipboardWriteResult =
  | {
      readonly ok: true;
      readonly assurance: 'sent';
      readonly sequence: string;
      readonly byteLength: number;
    }
  | {
      readonly ok: false;
      readonly diagnostic: TerminalDiagnostic;
    };

export function createClipboardWriteSequence(
  text: string,
  policy: ClipboardWritePolicy
): ClipboardWriteResult {
  const maxBytes = clipboardMaxBytes(policy.maxBytes);
  if (!policy.allow) return clipboardDenied();
  const sanitized = sanitizeTerminalText(text).text;
  const bytes = new TextEncoder().encode(sanitized);
  if (bytes.byteLength > maxBytes) {
    return {
      ok: false,
      diagnostic: diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Clipboard payload exceeds configured policy.', {
        severity: 'warning',
        target: 'clipboard',
        data: { byteLength: bytes.byteLength, maxBytes }
      })
    };
  }
  return {
    ok: true,
    assurance: 'sent',
    sequence: `\u001B]52;c;${base64(bytes)}\u0007`,
    byteLength: bytes.byteLength
  };
}

export async function writeClipboardText(
  sink: TerminalProtocolSink,
  text: string,
  policy: ClipboardWritePolicy
): Promise<ClipboardWriteResult> {
  const result = createClipboardWriteSequence(text, policy);
  if (!result.ok) return result;
  await sink.write(result.sequence);
  return result;
}

function clipboardDenied(): ClipboardWriteResult {
  return {
    ok: false,
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
