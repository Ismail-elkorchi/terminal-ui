import { normalizeKeyEvent } from './keys.ts';
import type {
  KeyEvent,
  KeyEventType,
  KeyLocation,
  KeyModifiers,
  KeyName,
  LetterKeyName
} from './types.ts';

const csiUnicodeKeyPattern = new RegExp(String.raw`^\u001B\[(\d+)(?::\d+(?::\d+)?)?(?:;(\d+)(?::([123]))?)?(?:;[\d:]+)?u`, 'u');
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

export function enhancedKeyFromPrefix(value: string): KeyEvent | undefined {
  const unicode = csiUnicodeKeyPattern.exec(value);
  if (unicode?.[0] !== undefined) {
    const codePoint = integer(unicode[1]);
    if (codePoint === undefined) return undefined;
    const key = keyFromCodePoint(codePoint);
    return event(key, unicode[0], unicode[2], unicode[3], keypadKeys[codePoint] === undefined ? 'standard' : 'numpad');
  }

  const final = csiFinalKeyPattern.exec(value);
  if (final?.[0] !== undefined) {
    return event(finalKeys[final[3] ?? ''] ?? 'unknown', final[0], final[1], final[2]);
  }

  const tilde = csiTildeKeyPattern.exec(value);
  if (tilde?.[0] !== undefined) {
    return event(tildeKeys[tilde[1] ?? ''] ?? 'unknown', tilde[0], tilde[2], tilde[3]);
  }
  return undefined;
}

function event(
  key: KeyName,
  sequence: string,
  encodedModifiers: string | undefined,
  encodedEventType: string | undefined,
  location: KeyLocation = 'standard'
): KeyEvent {
  return normalizeKeyEvent({
    key,
    sequence,
    modifiers: decodeModifiers(encodedModifiers),
    eventType: decodeEventType(encodedEventType),
    location
  });
}

function keyFromCodePoint(codePoint: number): KeyName {
  const keypad = keypadKeys[codePoint];
  if (keypad !== undefined) return keypad;
  if (codePoint >= 65 && codePoint <= 90) return String.fromCodePoint(codePoint + 32) as LetterKeyName;
  if (codePoint >= 97 && codePoint <= 122) return String.fromCodePoint(codePoint) as LetterKeyName;
  if (codePoint >= 48 && codePoint <= 57) return String.fromCodePoint(codePoint) as KeyName;
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
    meta: (flags & (8 | 16 | 32)) !== 0
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
