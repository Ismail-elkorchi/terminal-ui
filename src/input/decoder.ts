import { focusFromPrefix } from './focus.ts';
import { keyEvent, keyFromPrefix, keySequences } from './keys.ts';
import { mouseFromPrefix } from './mouse.ts';
import { bracketedPasteFromPrefix, isIncompleteBracketedPaste } from './paste.ts';
import type { TerminalInputChunk } from '../host/index.ts';
import type { InputDecodeOptions, InputDecoder, InputEvent } from './types.ts';

const csiPattern = new RegExp(String.raw`^\u001B\[[0-?]*[ -/]*[@-~]`, 'u');
const completeSgrMousePattern = new RegExp(String.raw`^\u001B\[<\d+;\d+;\d+[Mm]`, 'u');

export function decodeInputChunk(
  chunk: TerminalInputChunk,
  options: InputDecodeOptions = {}
): readonly InputEvent[] {
  const text = chunkText(chunk);
  if (text.length === 0) return [];
  if (text === ' ') return [keyEvent('space', text)];
  return decodeTerminalText(text, options, true).events;
}

export function createInputDecoder(options: InputDecodeOptions = {}): InputDecoder {
  let pending = '';

  return {
    decode(chunk) {
      const text = chunkText(chunk);
      if (text.length === 0) return [];
      if (pending.length === 0 && text === ' ') return [keyEvent('space', text)];
      pending += text;
      const result = decodeTerminalText(pending, options, false);
      pending = result.remainder;
      return result.events;
    },
    flush() {
      if (pending.length === 0) return [];
      const result = decodeTerminalText(pending, options, true);
      pending = '';
      return result.events;
    },
    reset() {
      pending = '';
    }
  };
}

function decodeTerminalText(
  text: string,
  options: InputDecodeOptions,
  final: boolean
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
    const remaining = text.slice(index);
    if (options.bracketedPaste !== false) {
      const paste = bracketedPasteFromPrefix(remaining);
      if (paste !== undefined) {
        flushText();
        events.push(paste.event);
        index += paste.length;
        continue;
      }
      if (!final && isIncompleteBracketedPaste(remaining)) {
        break;
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

    const key = keyFromPrefix(remaining);
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

function isIncompleteEscapeSequence(value: string): boolean {
  if (!value.startsWith('\u001B')) return false;
  if (value === '\u001B') return false;
  for (const sequence of keySequences.keys()) {
    if (sequence.startsWith(value) && value.length < sequence.length) return true;
  }
  if (value.startsWith('\u001B[M') && value.length < 6) return true;
  if (value.startsWith('\u001B[<') && !completeSgrMousePattern.test(value)) return true;
  return value.startsWith('\u001B[') && !csiPattern.test(value);
}

function unknownEscapeFromPrefix(value: string): string | undefined {
  if (!value.startsWith('\u001B')) return undefined;
  if (value.length === 1) return value;
  const csi = csiPattern.exec(value);
  if (csi?.[0] !== undefined) return csi[0];
  return value.slice(0, 1);
}

function chunkText(chunk: TerminalInputChunk): string {
  return typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data);
}
