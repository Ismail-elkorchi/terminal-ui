import { sanitizeTerminalTextWork } from './sanitize.ts';

import { isBoundedPrintableAscii } from './printable-ascii.ts';

const whitespaceCharacter = /\s/u;

/** Canonical picker field cleaning; unchanged ASCII needs no sanitizer descriptor. */
export function* cleanSearchFieldWork(value: string): Generator<number, string> {
  if (isBoundedPrintableAscii(value)) {
    yield value.length;
    return value;
  }
  if (value.length <= 2048) yield value.length; // Charge a failed bounded examination too.
  return yield* cleanSearchFieldFallbackWork(value);
}

/** General Unicode/control path; long fields retain cooperative checkpoints. */
function* cleanSearchFieldFallbackWork(value: string): Generator<number, string> {
  const text = (yield* sanitizeTerminalTextWork(value)).text;
  const parts: string[] = [];
  let retainedStart = 0;
  let whitespaceStart = -1;
  let newline = false;
  for (let offset = 0; offset <= text.length; offset += 1) {
    const character = text[offset];
    if (character !== undefined && whitespaceCharacter.test(character)) {
      if (whitespaceStart < 0) whitespaceStart = offset;
      if (character === '\n') newline = true;
    } else if (whitespaceStart >= 0) {
      if (newline) {
        parts.push(text.slice(retainedStart, whitespaceStart), ' ');
        retainedStart = offset;
      }
      whitespaceStart = -1;
      newline = false;
    }
    if ((offset + 1) % 256 === 0) yield 256;
  }
  yield (text.length + 1) % 256;
  if (parts.length === 0) return text;
  parts.push(text.slice(retainedStart));
  const cleaned = parts.join('');
  yield cleaned.length;
  return cleaned;
}
