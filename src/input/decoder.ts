import { focusFromPrefix } from './focus.ts';
import { InputDecodeError } from './decode-error.ts';
import { enhancedKeyFromPrefix } from './enhanced-keyboard.ts';
import { keyEvent, keyFromPrefix, keySequences } from './keys.ts';
import { mouseFromPrefix } from './mouse.ts';
import {
  bracketedPasteFromPrefix,
  incompleteBracketedPastePayloadLength,
  isIncompleteBracketedPaste
} from './paste.ts';
import { createUtf8StreamDecoder, decodeUtf8Chunk } from './utf8-stream.ts';
import type { TerminalInputChunk } from '../host/index.ts';
import type {
  InputDecodeLimits,
  InputDecodeOptions,
  InputDecoder,
  InputDecoderBatch,
  InputEvent,
  InputPendingState
} from './types.ts';

const csiPattern = new RegExp(String.raw`^\u001B\[[0-?]*[ -/]*[@-~]`, 'u');
const completeSgrMousePattern = new RegExp(String.raw`^\u001B\[<\d+;\d+;\d+[Mm]`, 'u');

export const defaultInputDecodeLimits: InputDecodeLimits = Object.freeze({
  maxPendingSequenceCodeUnits: 16_384,
  maxPasteCodeUnits: 1_048_576
});

export function decodeInputChunk(
  chunk: TerminalInputChunk,
  options: InputDecodeOptions = {}
): readonly InputEvent[] {
  const text = decodeUtf8Chunk(chunk);
  if (text.length === 0) return [];
  if (text === ' ') return [{ ...keyEvent('space', text), committedText: ' ' }];
  const limits = normalizeLimits(options.limits);
  return decodeTerminalText(text, options, true, limits).events;
}

export function createInputDecoder(options: InputDecodeOptions = {}): InputDecoder {
  let pending = '';
  const utf8 = createUtf8StreamDecoder();
  const limits = normalizeLimits(options.limits);

  return {
    decode(chunk) {
      try {
        const text = utf8.decode(chunk);
        if (text.length === 0) return batch([], pendingState(pending));
        if (pending.length === 0 && text === ' ') {
          return batch([{ ...keyEvent('space', text), committedText: ' ' }], { kind: 'none' });
        }
        pending += text;
        const result = decodeTerminalText(pending, options, false, limits);
        pending = result.remainder;
        assertPendingSequenceWithinLimit(pending, limits);
        return batch(result.events, pendingState(pending));
      } catch (cause) {
        pending = '';
        utf8.reset();
        throw cause;
      }
    },
    flush() {
      try {
        pending += utf8.flush();
        if (pending.length === 0) return batch([], { kind: 'none' });
        const result = decodeTerminalText(pending, options, true, limits);
        pending = '';
        return batch(result.events, { kind: 'none' });
      } catch (cause) {
        pending = '';
        utf8.reset();
        throw cause;
      }
    },
    reset() {
      pending = '';
      utf8.reset();
    }
  };
}

function decodeTerminalText(
  text: string,
  options: InputDecodeOptions,
  final: boolean,
  limits: InputDecodeLimits
): { readonly events: readonly InputEvent[]; readonly remainder: string } {
  const events: InputEvent[] = [];
  let buffer = '';
  let index = 0;

  const flushText = (): void => {
    if (buffer.length === 0) return;
    events.push({ kind: 'text', text: buffer, paste: false });
    buffer = '';
  };

  while (index < text.length) {
    const plainTextEnd = plainTextRunEnd(text, index);
    if (plainTextEnd > index) {
      buffer += text.slice(index, plainTextEnd);
      index = plainTextEnd;
      continue;
    }

    const remaining = text.slice(index);
    if (options.bracketedPaste !== false) {
      const paste = bracketedPasteFromPrefix(remaining);
      if (paste !== undefined) {
        assertPastePayloadWithinLimit(paste.event.text.length, limits);
        flushText();
        events.push(paste.event);
        index += paste.length;
        continue;
      }
      if (isIncompleteBracketedPaste(remaining)) {
        assertIncompletePasteWithinLimit(remaining, limits);
        if (!final) break;
      }
    }

    const focus = focusFromPrefix(remaining);
    if (focus !== undefined) {
      flushText();
      events.push(focus.event);
      index += focus.length;
      continue;
    }
    if (!final && isIncompleteEscapeSequence(remaining)) {
      break;
    }

    const mouse = mouseFromPrefix(remaining);
    if (mouse !== undefined) {
      flushText();
      events.push(mouse.event);
      index += mouse.length;
      continue;
    }

    const key = options.keyboard?.kind === 'kitty'
      ? enhancedKeyFromPrefix(remaining, options.keyboard) ?? keyFromPrefix(remaining)
      : keyFromPrefix(remaining);
    if (key !== undefined) {
      flushText();
      events.push(key);
      index += key.sequence?.length ?? 0;
      continue;
    }

    const unknown = unknownEscapeFromPrefix(remaining);
    if (unknown !== undefined) {
      flushText();
      events.push({ kind: 'unknown', sequence: unknown });
      index += unknown.length;
      continue;
    }

    const [character] = Array.from(remaining);
    if (character === undefined) break;
    buffer += character;
    index += character.length;
  }

  flushText();
  return { events, remainder: text.slice(index) };
}

function plainTextRunEnd(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 26 || codeUnit === 27 || codeUnit === 127) break;
    index += 1;
  }
  return index;
}

function isIncompleteEscapeSequence(value: string): boolean {
  if (!value.startsWith('\u001B')) return false;
  if (value === '\u001B') return true;
  for (const sequence of keySequences.keys()) {
    if (sequence.startsWith(value) && value.length < sequence.length) return true;
  }
  if (value.startsWith('\u001B[M') && value.length < 6) return true;
  if (value.startsWith('\u001B[<') && !completeSgrMousePattern.test(value)) return true;
  return value.startsWith('\u001B[') && !csiPattern.test(value);
}

function pendingState(value: string): InputPendingState {
  if (value.length === 0) return { kind: 'none' };
  return value === '\u001B' ? { kind: 'escape' } : { kind: 'sequence' };
}

function batch(events: readonly InputEvent[], pending: InputPendingState): InputDecoderBatch {
  return { events, pending };
}

function unknownEscapeFromPrefix(value: string): string | undefined {
  if (!value.startsWith('\u001B')) return undefined;
  if (value.length === 1) return value;
  const csi = csiPattern.exec(value);
  if (csi?.[0] !== undefined) return csi[0];
  return value.slice(0, 1);
}

function normalizeLimits(value: InputDecodeOptions['limits']): InputDecodeLimits {
  return {
    maxPendingSequenceCodeUnits: positiveInteger(
      value?.maxPendingSequenceCodeUnits,
      defaultInputDecodeLimits.maxPendingSequenceCodeUnits,
      'maxPendingSequenceCodeUnits'
    ),
    maxPasteCodeUnits: positiveInteger(
      value?.maxPasteCodeUnits,
      defaultInputDecodeLimits.maxPasteCodeUnits,
      'maxPasteCodeUnits'
    )
  };
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`Input decode limit ${name} must be a positive safe integer.`);
  }
  return resolved;
}

function assertPendingSequenceWithinLimit(value: string, limits: InputDecodeLimits): void {
  if (!isIncompleteBracketedPaste(value) && value.length > limits.maxPendingSequenceCodeUnits) {
    throw new InputDecodeError(
      'pending_sequence_limit_exceeded',
      limits.maxPendingSequenceCodeUnits,
      value.length
    );
  }
}

function assertIncompletePasteWithinLimit(value: string, limits: InputDecodeLimits): void {
  const payloadLength = incompleteBracketedPastePayloadLength(value);
  if (payloadLength !== undefined) assertPastePayloadWithinLimit(payloadLength, limits);
}

function assertPastePayloadWithinLimit(payloadLength: number, limits: InputDecodeLimits): void {
  if (payloadLength <= limits.maxPasteCodeUnits) return;
  throw new InputDecodeError('paste_limit_exceeded', limits.maxPasteCodeUnits, payloadLength);
}
