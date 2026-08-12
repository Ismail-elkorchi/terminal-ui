/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import { focusFromPrefix } from './focus.ts';
import { InputDecodeError } from './decode-error.ts';
import { enhancedKeyFromPrefix } from './enhanced-keyboard.ts';
import { keyFromPrefix } from './keys.ts';
import { mouseFromPrefix } from './mouse.ts';
import {
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
  bracketedPasteFromPrefix,
  incompleteBracketedPastePayloadLength,
  isIncompleteBracketedPaste
} from './paste.ts';
import { createUtf8StreamDecoder, decodeUtf8Chunk } from './utf8-stream.ts';
import type { TerminalInputChunk } from '../host/index.ts';
import { LEGACY_KEYBOARD_PROFILE, normalizeKeyboardProfile } from '../protocol/index.ts';
import type {
  InputDecodeLimits,
  InputDecodeOptions,
  InputDecoder,
  InputDecoderBatch,
  InputEvent,
  InputPendingState
} from './types.ts';

export const defaultInputDecodeLimits: InputDecodeLimits = Object.freeze({
  maxHostChunkBytes: 1_048_576,
  maxProtocolCodeUnits: 16_384,
  maxTextEventCodeUnits: 65_536,
  maxEventsPerBatch: 4_096,
  maxPasteCodeUnits: 1_048_576,
  maxKittyAssociatedTextCodePoints: 4_096,
  maxMouseFieldDigits: 9
});

export type NormalizedInputDecodeOptions = Omit<InputDecodeOptions, 'limits'> & {
  readonly limits: InputDecodeLimits;
};

export function decodeInputChunk(
  chunk: TerminalInputChunk,
  options: InputDecodeOptions = {}
): readonly InputEvent[] {
  const normalized = normalizeDecodeOptions(options);
  const limits = normalized.limits;
  assertHostChunkWithinLimit(chunk, limits);
  const text = decodeUtf8Chunk(chunk);
  if (text.length === 0) return [];
  return decodeTerminalText(text, normalized, true, limits, BRACKETED_PASTE_START.length).events;
}

export function createInputDecoder(options: InputDecodeOptions = {}): InputDecoder {
  return createInputDecoderFromNormalizedOptions(normalizeDecodeOptions(options));
}

/** Internal trusted path for pipeline profiles that already own canonical options. */
export function createInputDecoderFromNormalizedOptions(
  normalized: NormalizedInputDecodeOptions
): InputDecoder {
  let pending = '';
  let pasteSearchFrom = BRACKETED_PASTE_START.length;
  let protocolSearchFrom = 0;
  const utf8 = createUtf8StreamDecoder();
  const limits = normalized.limits;

  return {
    decode(chunk) {
      try {
        assertHostChunkWithinLimit(chunk, limits);
        const text = utf8.decode(chunk);
        if (text.length === 0) return batch([], pendingState(pending));
        pending += text;
        const result = decodeTerminalText(
          pending,
          normalized,
          false,
          limits,
          pasteSearchFrom,
          protocolSearchFrom
        );
        pending = result.remainder;
        pasteSearchFrom = result.pasteSearchFrom;
        protocolSearchFrom = result.protocolSearchFrom;
        assertProtocolWithinLimit(pending, limits);
        return batch(result.events, pendingState(pending));
      } catch (cause) {
        pending = '';
        pasteSearchFrom = BRACKETED_PASTE_START.length;
        protocolSearchFrom = 0;
        utf8.reset();
        throw cause;
      }
    },
    flush() {
      try {
        pending += utf8.flush();
        if (pending.length === 0) return batch([], { kind: 'none' });
        const result = decodeTerminalText(
          pending,
          normalized,
          true,
          limits,
          pasteSearchFrom,
          protocolSearchFrom
        );
        pending = '';
        pasteSearchFrom = BRACKETED_PASTE_START.length;
        protocolSearchFrom = 0;
        return batch(result.events, { kind: 'none' });
      } catch (cause) {
        pending = '';
        pasteSearchFrom = BRACKETED_PASTE_START.length;
        protocolSearchFrom = 0;
        utf8.reset();
        throw cause;
      }
    },
    reset() {
      pending = '';
      pasteSearchFrom = BRACKETED_PASTE_START.length;
      protocolSearchFrom = 0;
      utf8.reset();
    }
  };
}

function decodeTerminalText(
  text: string,
  options: InputDecodeOptions,
  final: boolean,
  limits: InputDecodeLimits,
  pasteSearchFrom: number,
  protocolSearchFrom = 0
): {
  readonly events: readonly InputEvent[];
  readonly remainder: string;
  readonly pasteSearchFrom: number;
  readonly protocolSearchFrom: number;
} {
  const events: InputEvent[] = [];
  let buffer = '';
  let index = 0;

  const flushText = (): void => {
    if (buffer.length === 0) return;
    for (const textEvent of boundedTextEvents(buffer, limits.maxTextEventCodeUnits)) {
      pushEvent({ kind: 'text', text: textEvent, paste: false });
    }
    buffer = '';
  };
  const pushEvent = (event: InputEvent): void => {
    const received = events.length + 1;
    if (received > limits.maxEventsPerBatch) {
      throw new InputDecodeError('event_batch_limit_exceeded', limits.maxEventsPerBatch, received);
    }
    events.push(event);
  };

  while (index < text.length) {
    const plainTextEnd = plainTextRunEnd(text, index);
    if (plainTextEnd > index) {
      buffer += text.slice(index, plainTextEnd);
      index = plainTextEnd;
      continue;
    }

    const remaining = text.slice(index);
    if (options.bracketedPaste === true) {
      const paste = bracketedPasteFromPrefix(
        remaining,
        index === 0 ? pasteSearchFrom : BRACKETED_PASTE_START.length
      );
      if (paste !== undefined) {
        assertPastePayloadWithinLimit(paste.event.text.length, limits);
        flushText();
        pushEvent(paste.event);
        index += paste.length;
        continue;
      }
      if (isIncompleteBracketedPaste(remaining)) {
        assertIncompletePasteWithinLimit(remaining, limits);
        if (!final) break;
        flushText();
        pushEvent({ kind: 'unknown', sequence: remaining });
        index = text.length;
        continue;
      }
    }

    const frame = terminalControlFrame(remaining, index === 0 ? protocolSearchFrom : 0);
    if (frame.kind === 'complete' && !remaining.startsWith(BRACKETED_PASTE_START)) {
      assertProtocolLength(frame.length, limits);
    }
    if (!final && frame.kind === 'pending') break;

    const focus = options.focusReporting === true ? focusFromPrefix(normalizedControlPrefix(remaining)) : undefined;
    if (focus !== undefined) {
      flushText();
      pushEvent(focus.event);
      index += controlPrefixLength(remaining, focus.length);
      continue;
    }

    const mouse = options.mouseReporting !== undefined && options.mouseReporting !== 'none'
      ? mouseFromPrefix(
          normalizedControlPrefix(remaining),
          limits.maxMouseFieldDigits,
          options.mouseReporting
        )
      : undefined;
    if (mouse !== undefined) {
      flushText();
      pushEvent(mouse.event);
      index += controlPrefixLength(remaining, mouse.length);
      continue;
    }

    const normalizedRemaining = normalizedControlPrefix(remaining);
    const key = enhancedKeyFromPrefix(
      normalizedRemaining,
      options.keyboard ?? LEGACY_KEYBOARD_PROFILE,
      limits.maxKittyAssociatedTextCodePoints
    ) ?? keyFromPrefix(normalizedRemaining);
    if (key !== undefined) {
      flushText();
      pushEvent(key);
      index += controlPrefixLength(remaining, key.sequence?.length ?? 0);
      continue;
    }

    const unknown = unknownTerminalControlFromPrefix(remaining, final);
    if (unknown !== undefined) {
      flushText();
      pushEvent({ kind: 'unknown', sequence: unknown });
      index += unknown.length;
      continue;
    }

    const control = unknownControlFromPrefix(remaining);
    if (control !== undefined) {
      flushText();
      pushEvent({ kind: 'unknown', sequence: control });
      index += control.length;
      continue;
    }

    const [character] = Array.from(remaining);
    if (character === undefined) break;
    buffer += character;
    index += character.length;
  }

  flushText();
  const remainder = text.slice(index);
  return {
    events,
    remainder,
    pasteSearchFrom: remainder.startsWith(BRACKETED_PASTE_START)
      ? Math.max(
          BRACKETED_PASTE_START.length,
          remainder.length - BRACKETED_PASTE_END.length + 1
        )
      : BRACKETED_PASTE_START.length,
    protocolSearchFrom: remainder.length === 0 ? 0 : Math.max(0, remainder.length - 1)
  };
}

function plainTextRunEnd(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 32 || codeUnit === 127 || (codeUnit >= 128 && codeUnit <= 159)) break;
    index += 1;
  }
  return index;
}

function unknownControlFromPrefix(value: string): string | undefined {
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined) return undefined;
  return codePoint < 32 || codePoint === 127 || (codePoint >= 128 && codePoint <= 159)
    ? String.fromCodePoint(codePoint)
    : undefined;
}

function pendingState(value: string): InputPendingState {
  if (value.length === 0) return { kind: 'none' };
  if (value.startsWith(BRACKETED_PASTE_START)) return { kind: 'paste' };
  return value === '\u001B' ? { kind: 'escape' } : { kind: 'sequence' };
}

function batch(events: readonly InputEvent[], pending: InputPendingState): InputDecoderBatch {
  return { events, pending };
}

type TerminalControlFrame =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'complete'; readonly length: number };

function terminalControlFrame(value: string, searchFrom = 0): TerminalControlFrame {
  const first = value.codePointAt(0);
  if (first === undefined) return { kind: 'none' };
  if (first === 0x1b) {
    if (value.length === 1) return { kind: 'pending' };
    const second = value.codePointAt(1);
    if (second === 0x5b) return parameterizedControlFrame(value, 2, searchFrom);
    if (second === 0x4f) return parameterizedControlFrame(value, 2, searchFrom);
    if (second === 0x5d) return stringControlFrame(value, 2, true, searchFrom);
    if (second === 0x50 || second === 0x58 || second === 0x5e || second === 0x5f) {
      return stringControlFrame(value, 2, false, searchFrom);
    }
    const character = Array.from(value.slice(1))[0];
    return character === undefined ? { kind: 'pending' } : { kind: 'complete', length: 1 + character.length };
  }
  if (first === 0x9b || first === 0x8f) return parameterizedControlFrame(value, 1, searchFrom);
  if (first === 0x9d) return stringControlFrame(value, 1, true, searchFrom);
  if (first === 0x90 || first === 0x98 || first === 0x9e || first === 0x9f) {
    return stringControlFrame(value, 1, false, searchFrom);
  }
  if (first >= 0x80 && first <= 0x9f) return { kind: 'complete', length: 1 };
  return { kind: 'none' };
}

function parameterizedControlFrame(value: string, start: number, searchFrom: number): TerminalControlFrame {
  for (let index = Math.max(start, searchFrom); index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return { kind: 'complete', length: index + 1 };
    if (code < 0x20 || code > 0x3f) return { kind: 'complete', length: index + 1 };
  }
  return { kind: 'pending' };
}

function stringControlFrame(
  value: string,
  start: number,
  bellTerminates: boolean,
  searchFrom: number
): TerminalControlFrame {
  for (let index = Math.max(start, searchFrom); index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (bellTerminates && code === 0x07) return { kind: 'complete', length: index + 1 };
    if (code === 0x9c) return { kind: 'complete', length: index + 1 };
    if (code === 0x1b && value.charCodeAt(index + 1) === 0x5c) {
      return { kind: 'complete', length: index + 2 };
    }
  }
  return { kind: 'pending' };
}

function unknownTerminalControlFromPrefix(value: string, final: boolean): string | undefined {
  const frame = terminalControlFrame(value);
  if (frame.kind === 'complete') return value.slice(0, frame.length);
  if (frame.kind === 'pending' && final) return value;
  return undefined;
}

function normalizedControlPrefix(value: string): string {
  const first = value.codePointAt(0);
  if (first === 0x9b) return `\u001B[${value.slice(1)}`;
  if (first === 0x8f) return `\u001BO${value.slice(1)}`;
  return value;
}

function controlPrefixLength(original: string, normalizedLength: number): number {
  const first = original.codePointAt(0);
  return first === 0x9b || first === 0x8f ? normalizedLength - 1 : normalizedLength;
}

export function normalizeInputDecodeLimits(value: Partial<InputDecodeLimits> | undefined): InputDecodeLimits {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new TypeError('Input decode limits must be an object.');
  }
  return Object.freeze({
    maxHostChunkBytes: positiveInteger(
      value?.maxHostChunkBytes,
      defaultInputDecodeLimits.maxHostChunkBytes,
      'maxHostChunkBytes'
    ),
    maxProtocolCodeUnits: positiveInteger(
      value?.maxProtocolCodeUnits,
      defaultInputDecodeLimits.maxProtocolCodeUnits,
      'maxProtocolCodeUnits'
    ),
    maxTextEventCodeUnits: positiveInteger(
      value?.maxTextEventCodeUnits,
      defaultInputDecodeLimits.maxTextEventCodeUnits,
      'maxTextEventCodeUnits'
    ),
    maxEventsPerBatch: positiveInteger(
      value?.maxEventsPerBatch,
      defaultInputDecodeLimits.maxEventsPerBatch,
      'maxEventsPerBatch'
    ),
    maxPasteCodeUnits: positiveInteger(
      value?.maxPasteCodeUnits,
      defaultInputDecodeLimits.maxPasteCodeUnits,
      'maxPasteCodeUnits'
    ),
    maxKittyAssociatedTextCodePoints: positiveInteger(
      value?.maxKittyAssociatedTextCodePoints,
      defaultInputDecodeLimits.maxKittyAssociatedTextCodePoints,
      'maxKittyAssociatedTextCodePoints'
    ),
    maxMouseFieldDigits: positiveInteger(
      value?.maxMouseFieldDigits,
      defaultInputDecodeLimits.maxMouseFieldDigits,
      'maxMouseFieldDigits'
    )
  });
}

function normalizeDecodeOptions(value: InputDecodeOptions): NormalizedInputDecodeOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Input decode options must be an object.');
  }
  const bracketedPaste = value.bracketedPaste;
  if (bracketedPaste !== undefined && typeof bracketedPaste !== 'boolean') {
    throw new TypeError('Input decode option bracketedPaste must be boolean.');
  }
  const focusReporting = value.focusReporting;
  if (focusReporting !== undefined && typeof focusReporting !== 'boolean') {
    throw new TypeError('Input decode option focusReporting must be boolean.');
  }
  const mouseReporting = value.mouseReporting;
  if (
    mouseReporting !== undefined
    && mouseReporting !== 'none'
    && mouseReporting !== 'click'
    && mouseReporting !== 'drag'
    && mouseReporting !== 'all'
  ) {
    throw new TypeError('Input decode option mouseReporting is unsupported.');
  }
  const limits = normalizeInputDecodeLimits(value.limits);
  const keyboard = value.keyboard === undefined
    ? undefined
    : normalizeKeyboardProfile(value.keyboard);
  return Object.freeze({
    ...(keyboard === undefined ? {} : { keyboard }),
    ...(bracketedPaste === undefined ? {} : { bracketedPaste }),
    ...(focusReporting === undefined ? {} : { focusReporting }),
    ...(mouseReporting === undefined ? {} : { mouseReporting }),
    limits
  });
}

function assertNonArrayRecord(
  value: unknown,
  subject: string
): asserts value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (typeof resolved !== 'number' || !Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`Input decode limit ${name} must be a positive safe integer.`);
  }
  return resolved;
}

function assertHostChunkWithinLimit(chunk: TerminalInputChunk, limits: InputDecodeLimits): void {
  const candidate: unknown = chunk;
  assertNonArrayRecord(candidate, 'Terminal input chunk');
  const fields = Object.keys(candidate);
  if (fields.length !== 1 || fields[0] !== 'data') {
    throw new TypeError('Terminal input chunk must contain only data.');
  }
  const data = candidate['data'];
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
    throw new TypeError('Terminal input chunk data must be a string or Uint8Array.');
  }
  if (typeof data === 'string' && data.length > limits.maxHostChunkBytes) {
    throw new InputDecodeError('host_chunk_limit_exceeded', limits.maxHostChunkBytes, data.length);
  }
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
  if (bytes > limits.maxHostChunkBytes) {
    throw new InputDecodeError('host_chunk_limit_exceeded', limits.maxHostChunkBytes, bytes);
  }
}

function assertProtocolWithinLimit(value: string, limits: InputDecodeLimits): void {
  if (!isIncompleteBracketedPaste(value)) assertProtocolLength(value.length, limits);
}

function assertProtocolLength(length: number, limits: InputDecodeLimits): void {
  if (length > limits.maxProtocolCodeUnits) {
    throw new InputDecodeError('protocol_token_limit_exceeded', limits.maxProtocolCodeUnits, length);
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

function boundedTextEvents(value: string, maximum: number): readonly string[] {
  if (value.length <= maximum) return [value];
  const result: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maximum);
    const last = value.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff && end < value.length) end -= 1;
    if (end === start) {
      throw new InputDecodeError('text_event_limit_exceeded', maximum, value.length);
    }
    result.push(value.slice(start, end));
    start = end;
  }
  return result;
}
