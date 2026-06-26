import { diagnostic } from '../diagnostics.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';

export interface ClipboardWritePolicy {
  readonly allow: boolean;
  readonly maxBytes?: number;
}

export type ClipboardWriteResult =
  | {
      readonly ok: true;
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
  if (!policy.allow) return clipboardDenied();
  const sanitized = sanitizeTerminalText(text).text;
  const bytes = new TextEncoder().encode(sanitized);
  const maxBytes = Math.max(0, Math.floor(policy.maxBytes ?? 1_000_000));
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
    sequence: `\u001B]52;c;${base64(bytes)}\u0007`,
    byteLength: bytes.byteLength
  };
}

export async function writeClipboardText(
  host: TerminalHost,
  text: string,
  policy: ClipboardWritePolicy
): Promise<ClipboardWriteResult> {
  const capabilities = await host.getCapabilities();
  if (!capabilities.clipboard.supported) {
    return {
      ok: false,
      diagnostic: diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Terminal clipboard write is unavailable.', {
        severity: 'warning',
        target: 'clipboard',
        data: {
          confidence: capabilities.clipboard.confidence,
          reason: capabilities.clipboard.reason ?? null
        }
      })
    };
  }
  const result = createClipboardWriteSequence(text, policy);
  if (!result.ok) return result;
  await host.write({ text: result.sequence });
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

function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    output += alphabet[(value >> 18) & 63] ?? '';
    output += alphabet[(value >> 12) & 63] ?? '';
    output += index + 1 < bytes.length ? alphabet[(value >> 6) & 63] ?? '' : '=';
    output += index + 2 < bytes.length ? alphabet[value & 63] ?? '' : '=';
  }
  return output;
}
