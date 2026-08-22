import { Buffer } from 'node:buffer';
import { diagnostic } from '../diagnostics.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalProtocolSink } from './types.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

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

const clipboardWritePolicies = new WeakSet<object>();

export function decodeClipboardWritePolicy(value: unknown): ClipboardWritePolicy {
  if (!isNonArrayObject(value)) {
    throw new TypeError('Clipboard write policy must be an object.');
  }
  if (isClipboardWritePolicy(value)) return value;
  if (typeof value['allowed'] !== 'boolean') {
    throw new TypeError('Clipboard write policy allowed must be a boolean.');
  }
  const maxBytes = value['maxBytes'];
  if (
    maxBytes !== undefined
    && (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes < 0)
  ) {
    throw new RangeError(
      'Clipboard write policy maxBytes must be a finite non-negative safe integer.',
    );
  }
  const policy = Object.freeze({
    allowed: value['allowed'],
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
  clipboardWritePolicies.add(policy);
  return policy;
}

function isClipboardWritePolicy(value: object): value is ClipboardWritePolicy {
  return clipboardWritePolicies.has(value);
}

export function createClipboardWriteSequence(
  text: string,
  policy: ClipboardWritePolicy
): ClipboardWriteSequenceResult {
  const preparedPolicy = decodeClipboardWritePolicy(policy);
  const maxBytes = preparedPolicy.maxBytes ?? 1_000_000;
  if (!preparedPolicy.allowed) return clipboardDenied();
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

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
