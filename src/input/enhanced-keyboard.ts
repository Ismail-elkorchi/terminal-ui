import { normalizeKeyEvent } from './keys.ts';
import type {
  KeyEvent,
  KeyEventType,
  KeyLocation,
  KeyModifiers,
  KeyName,
  LetterKeyName
} from './types.ts';
import { functionKeyNames } from './types.ts';
import { KITTY_KEYBOARD_FLAGS } from '../protocol/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';
import { InputDecodeError } from './decode-error.ts';

const csiUnicodeKeyPattern = new RegExp(String.raw`^\u001B\[(\d+)(?::(\d+)?(?::(\d+))?)?(?:;(\d+)(?::([123]))?)?(?:;([\d:]+))?u`, 'u');
const csiFinalKeyPattern = new RegExp(String.raw`^\u001B\[1(?:;(\d+)(?::([123]))?)?([ABCDEFHPQRS])`, 'u');
const csiTildeKeyPattern = new RegExp(String.raw`^\u001B\[(\d+)(?:;(\d+)(?::([123]))?)?~`, 'u');

const finalKeys: Readonly<Record<string, KeyName>> = Object.freeze({
  A: 'arrowUp',
  B: 'arrowDown',
  C: 'arrowRight',
  D: 'arrowLeft',
  E: 'unknown',
  F: 'end',
  H: 'home',
  P: 'f1',
  Q: 'f2',
  R: 'f3',
  S: 'f4'
});

const tildeKeys: Readonly<Record<string, KeyName>> = Object.freeze({
  '2': 'insert',
  '3': 'delete',
  '5': 'pageUp',
  '6': 'pageDown',
  '7': 'home',
  '8': 'end',
  '11': 'f1',
  '12': 'f2',
  '13': 'f3',
  '14': 'f4',
  '15': 'f5',
  '17': 'f6',
  '18': 'f7',
  '19': 'f8',
  '20': 'f9',
  '21': 'f10',
  '23': 'f11',
  '24': 'f12'
});

const keypadKeys: Readonly<Record<number, KeyName>> = Object.freeze({
  57399: '0',
  57400: '1',
  57401: '2',
  57402: '3',
  57403: '4',
  57404: '5',
  57405: '6',
  57406: '7',
  57407: '8',
  57408: '9',
  57409: 'decimal',
  57410: 'divide',
  57411: 'multiply',
  57412: 'subtract',
  57413: 'add',
  57414: 'enter',
  57415: 'equal',
  57417: 'arrowLeft',
  57418: 'arrowRight',
  57419: 'arrowUp',
  57420: 'arrowDown',
  57421: 'pageUp',
  57422: 'pageDown',
  57423: 'home',
  57424: 'end',
  57425: 'insert',
  57426: 'delete'
});

export function enhancedKeyFromPrefix(
  value: string,
  profile: TerminalKeyboardProfile,
  maxAssociatedTextCodePoints: number
): KeyEvent | undefined {
  const unicode = csiUnicodeKeyPattern.exec(value);
  if (unicode?.[0] !== undefined) {
    if (!acceptsEventType(unicode[5], profile)) return undefined;
    const codePoint = integer(unicode[1]);
    if (codePoint === undefined || !isUnicodeScalar(codePoint)) return undefined;
    const key = keyFromCodePoint(codePoint);
    const alternateCodePoints = alternateKeys(unicode[2], unicode[3], profile);
    if (alternateCodePoints === null) return undefined;
    const committedText = associatedText(unicode[6], profile, maxAssociatedTextCodePoints);
    if (committedText === null) return undefined;
    return event(
      key,
      unicode[0],
      unicode[4],
      unicode[5],
      keypadKeys[codePoint] === undefined ? 'standard' : 'numpad',
      codePoint,
      alternateCodePoints,
      committedText
    );
  }

  const final = csiFinalKeyPattern.exec(value);
  if (final?.[0] !== undefined) {
    if (!acceptsEventType(final[2], profile)) return undefined;
    return event(finalKeys[final[3] ?? ''] ?? 'unknown', final[0], final[1], final[2]);
  }

  const tilde = csiTildeKeyPattern.exec(value);
  if (tilde?.[0] !== undefined) {
    if (!acceptsEventType(tilde[3], profile)) return undefined;
    return event(tildeKeys[tilde[1] ?? ''] ?? 'unknown', tilde[0], tilde[2], tilde[3]);
  }
  return undefined;
}

function event(
  key: KeyName,
  sequence: string,
  encodedModifiers: string | undefined,
  encodedEventType: string | undefined,
  location: KeyLocation = 'standard',
  keyCodePoint?: number,
  alternateCodePoints?: KeyEvent['alternateCodePoints'],
  committedText?: string
): KeyEvent {
  return normalizeKeyEvent({
    key,
    ...(keyCodePoint === undefined ? {} : { keyCodePoint }),
    sequence,
    modifiers: decodeModifiers(encodedModifiers),
    eventType: decodeEventType(encodedEventType),
    location,
    ...(alternateCodePoints === undefined ? {} : { alternateCodePoints }),
    ...(committedText === undefined ? {} : { committedText })
  });
}

function acceptsEventType(
  value: string | undefined,
  profile: TerminalKeyboardProfile
): boolean {
  return value === undefined
    || (profile.kind === 'kitty' && (profile.flags & KITTY_KEYBOARD_FLAGS.reportEventTypes) !== 0);
}

function alternateKeys(
  shiftedValue: string | undefined,
  baseLayoutValue: string | undefined,
  profile: TerminalKeyboardProfile
): KeyEvent['alternateCodePoints'] | null | undefined {
  if (shiftedValue === undefined && baseLayoutValue === undefined) return undefined;
  if (profile.kind !== 'kitty' || (profile.flags & KITTY_KEYBOARD_FLAGS.reportAlternateKeys) === 0) {
    return null;
  }
  const shifted = shiftedValue === undefined || shiftedValue.length === 0 ? undefined : integer(shiftedValue);
  const baseLayout = baseLayoutValue === undefined || baseLayoutValue.length === 0 ? undefined : integer(baseLayoutValue);
  if (
    (shiftedValue !== undefined && shiftedValue.length > 0 && (shifted === undefined || !isUnicodeScalar(shifted)))
    || (baseLayoutValue !== undefined && baseLayoutValue.length > 0 && (baseLayout === undefined || !isUnicodeScalar(baseLayout)))
    || (shifted === undefined && baseLayout === undefined)
  ) return null;
  return {
    ...(shifted === undefined ? {} : { shifted }),
    ...(baseLayout === undefined ? {} : { baseLayout })
  };
}

function associatedText(
  value: string | undefined,
  profile: TerminalKeyboardProfile,
  maximumCodePoints: number
): string | null | undefined {
  if (value === undefined) return undefined;
  if (
    profile.kind !== 'kitty'
    || (profile.flags & KITTY_KEYBOARD_FLAGS.reportAssociatedText) === 0
  ) return null;
  let text = '';
  let start = 0;
  let count = 0;
  for (;;) {
    count += 1;
    if (count > maximumCodePoints) {
      throw new InputDecodeError('kitty_text_limit_exceeded', maximumCodePoints, count);
    }
    const separator = value.indexOf(':', start);
    const end = separator === -1 ? value.length : separator;
    const field = value.slice(start, end);
    const point = integer(field);
    if (point === undefined || !isTextScalar(point)) return null;
    text += String.fromCodePoint(point);
    if (separator === -1) break;
    start = separator + 1;
  }
  return text;
}

function isTextScalar(value: number): boolean {
  return isUnicodeScalar(value)
    && value >= 0x20
    && value !== 0x7f
    && !(value >= 0x80 && value <= 0x9f);
}

function isUnicodeScalar(value: number): boolean {
  return value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
}

function keyFromCodePoint(codePoint: number): KeyName {
  const keypad = keypadKeys[codePoint];
  if (keypad !== undefined) return keypad;
  if (codePoint >= 65 && codePoint <= 90) return String.fromCodePoint(codePoint + 32) as LetterKeyName;
  if (codePoint >= 97 && codePoint <= 122) return String.fromCodePoint(codePoint) as LetterKeyName;
  if (codePoint >= 48 && codePoint <= 57) return String.fromCodePoint(codePoint) as KeyName;
  if (codePoint >= 57376 && codePoint <= 57398) {
    return functionKeyNames[codePoint - 57364] ?? 'unknown';
  }
  if (codePoint === 9) return 'tab';
  if (codePoint === 13) return 'enter';
  if (codePoint === 27) return 'escape';
  if (codePoint === 32) return 'space';
  if (codePoint === 61) return 'equal';
  if (codePoint === 127) return 'backspace';
  return 'unknown';
}

function decodeModifiers(value: string | undefined): Partial<KeyModifiers> {
  const parameter = integer(value) ?? 1;
  const flags = Math.max(0, parameter - 1);
  return {
    shift: (flags & 1) !== 0,
    alt: (flags & 2) !== 0,
    ctrl: (flags & 4) !== 0,
    meta: (flags & 32) !== 0,
    ...((flags & 8) === 0 ? {} : { super: true as const }),
    ...((flags & 16) === 0 ? {} : { hyper: true as const }),
    ...((flags & 64) === 0 ? {} : { capsLock: true as const }),
    ...((flags & 128) === 0 ? {} : { numLock: true as const })
  };
}

function decodeEventType(value: string | undefined): KeyEventType {
  if (value === '2') return 'repeat';
  if (value === '3') return 'release';
  return 'press';
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const result = Number.parseInt(value, 10);
  return Number.isSafeInteger(result) && result >= 0 ? result : undefined;
}
