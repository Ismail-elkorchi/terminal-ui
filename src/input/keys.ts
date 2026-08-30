import type {
  InputEvent,
  KeyEvent,
  KeyEventLike,
  KeyLocation,
  KeyModifiers,
  KeyName,
  LetterKeyName
} from './types.ts';

const modifiedNavigationFinalPattern = new RegExp(String.raw`^\u001B\[1;(\d+)([ABCDFHPQRS])`, 'u');
const modifiedTildePattern = new RegExp(String.raw`^\u001B\[(\d+);(\d+)~`, 'u');
const altPrintablePattern = new RegExp(String.raw`^\u001B([ -~])`, 'u');
const terminalControlIntroducers = new Set(['[', 'O', ']', 'P', 'X', '^', '_']);

interface KeySequence {
  readonly key: KeyName;
  readonly location?: KeyLocation;
  readonly modifiers?: Partial<KeyModifiers>;
}

export const keySequences: ReadonlyMap<string, KeySequence> = new Map([
  ['\u001B[2~', { key: 'insert' }],
  ['\u001B[3~', { key: 'delete' }],
  ['\u001B[5~', { key: 'pageUp' }],
  ['\u001B[6~', { key: 'pageDown' }],
  ['\u001B[A', { key: 'arrowUp' }],
  ['\u001B[B', { key: 'arrowDown' }],
  ['\u001B[C', { key: 'arrowRight' }],
  ['\u001B[D', { key: 'arrowLeft' }],
  ['\u001B[H', { key: 'home' }],
  ['\u001B[F', { key: 'end' }],
  ['\u001BOA', { key: 'arrowUp' }],
  ['\u001BOB', { key: 'arrowDown' }],
  ['\u001BOC', { key: 'arrowRight' }],
  ['\u001BOD', { key: 'arrowLeft' }],
  ['\u001BOH', { key: 'home' }],
  ['\u001BOF', { key: 'end' }],
  ['\u001B[1~', { key: 'home' }],
  ['\u001B[4~', { key: 'end' }],
  ['\u001BOP', { key: 'f1' }],
  ['\u001BOQ', { key: 'f2' }],
  ['\u001BOR', { key: 'f3' }],
  ['\u001BOS', { key: 'f4' }],
  ['\u001B[P', { key: 'f1' }],
  ['\u001B[Q', { key: 'f2' }],
  ['\u001B[R', { key: 'f3' }],
  ['\u001B[S', { key: 'f4' }],
  ['\u001B[15~', { key: 'f5' }],
  ['\u001B[17~', { key: 'f6' }],
  ['\u001B[18~', { key: 'f7' }],
  ['\u001B[19~', { key: 'f8' }],
  ['\u001B[20~', { key: 'f9' }],
  ['\u001B[21~', { key: 'f10' }],
  ['\u001B[23~', { key: 'f11' }],
  ['\u001B[24~', { key: 'f12' }],
  ['\u001B[25~', { key: 'f13' }],
  ['\u001B[26~', { key: 'f14' }],
  ['\u001B[28~', { key: 'f15' }],
  ['\u001B[29~', { key: 'f16' }],
  ['\u001B[31~', { key: 'f17' }],
  ['\u001B[32~', { key: 'f18' }],
  ['\u001B[33~', { key: 'f19' }],
  ['\u001B[34~', { key: 'f20' }],
  ['\u001BOp', { key: '0', location: 'numpad' }],
  ['\u001BOq', { key: '1', location: 'numpad' }],
  ['\u001BOr', { key: '2', location: 'numpad' }],
  ['\u001BOs', { key: '3', location: 'numpad' }],
  ['\u001BOt', { key: '4', location: 'numpad' }],
  ['\u001BOu', { key: '5', location: 'numpad' }],
  ['\u001BOv', { key: '6', location: 'numpad' }],
  ['\u001BOw', { key: '7', location: 'numpad' }],
  ['\u001BOx', { key: '8', location: 'numpad' }],
  ['\u001BOy', { key: '9', location: 'numpad' }],
  ['\u001BOM', { key: 'enter', location: 'numpad' }],
  ['\u001BOn', { key: 'decimal', location: 'numpad' }],
  ['\u001BOj', { key: 'multiply', location: 'numpad' }],
  ['\u001BOk', { key: 'add', location: 'numpad' }],
  ['\u001BOm', { key: 'subtract', location: 'numpad' }],
  ['\u001BOo', { key: 'divide', location: 'numpad' }],
  ['\u001BOX', { key: 'equal', location: 'numpad' }],
  ['\r', { key: 'enter' }],
  ['\n', { key: 'enter' }],
  ['\t', { key: 'tab' }],
  ['\u007F', { key: 'backspace' }],
  ['\b', { key: 'backspace' }]
]);

const finalNavigationKeys: ReadonlyMap<string, KeyName> = new Map([
  ['A', 'arrowUp'], ['B', 'arrowDown'], ['C', 'arrowRight'],
  ['D', 'arrowLeft'], ['H', 'home'], ['F', 'end'],
  ['P', 'f1'], ['Q', 'f2'], ['R', 'f3'], ['S', 'f4']
]);

const tildeKeys: ReadonlyMap<string, KeyName> = new Map([
  ['1', 'home'], ['2', 'insert'], ['3', 'delete'], ['4', 'end'],
  ['5', 'pageUp'], ['6', 'pageDown'], ['15', 'f5'], ['17', 'f6'],
  ['18', 'f7'], ['19', 'f8'], ['20', 'f9'], ['21', 'f10'],
  ['23', 'f11'], ['24', 'f12'], ['25', 'f13'], ['26', 'f14'],
  ['28', 'f15'], ['29', 'f16'],
  ['31', 'f17'], ['32', 'f18'], ['33', 'f19'], ['34', 'f20']
]);

export function normalizeKeyEvent(event: KeyEventLike): KeyEvent {
  return {
    kind: 'key',
    key: event.key,
    ...(event.keyCodePoint === undefined
      ? {}
      : { keyCodePoint: requiredUnicodeScalar(event.keyCodePoint, 'key code point') }),
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    modifiers: normalizeModifiers(event.modifiers),
    eventType: event.eventType ?? 'press',
    location: event.location ?? 'standard',
    ...(event.alternateCodePoints === undefined
      ? {}
      : { alternateCodePoints: normalizeAlternateCodePoints(event.alternateCodePoints) }),
    ...(event.committedText === undefined ? {} : { committedText: event.committedText })
  };
}

function normalizeAlternateCodePoints(
  alternate: NonNullable<KeyEventLike['alternateCodePoints']>
): NonNullable<KeyEvent['alternateCodePoints']> {
  const shifted = optionalUnicodeScalar(alternate.shifted, 'shifted alternate key');
  const baseLayout = optionalUnicodeScalar(alternate.baseLayout, 'base-layout alternate key');
  if (shifted === undefined && baseLayout === undefined) {
    throw new TypeError('Alternate key code points must contain shifted or baseLayout.');
  }
  return Object.freeze({
    ...(shifted === undefined ? {} : { shifted }),
    ...(baseLayout === undefined ? {} : { baseLayout })
  });
}

function optionalUnicodeScalar(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    throw new RangeError(`${name} must be a Unicode scalar value.`);
  }
  return value;
}

function requiredUnicodeScalar(value: number, name: string): number {
  const normalized = optionalUnicodeScalar(value, name);
  if (normalized === undefined) throw new RangeError(`${name} must be a Unicode scalar value.`);
  return normalized;
}

export function isCancelKey(event: InputEvent): boolean {
  return event.kind === 'key' && event.key === 'escape' && event.eventType === 'press';
}

export function isInterruptKey(event: InputEvent): boolean {
  return event.kind === 'key'
    && event.key === 'c'
    && event.modifiers.ctrl
    && event.eventType === 'press';
}

export function keyFromPrefix(value: string): KeyEvent | undefined {
  const modified = modifiedKeyFromPrefix(value);
  if (modified !== undefined) return modified;
  if (value.startsWith('\u001B[Z')) {
    return normalizeKeyEvent({ key: 'tab', sequence: '\u001B[Z', modifiers: { shift: true } });
  }
  for (const [sequence, descriptor] of keySequences) {
    if (value.startsWith(sequence)) return keyEvent(descriptor.key, sequence, descriptor);
  }
  const altPrintable = altPrintablePattern.exec(value);
  if (
    altPrintable?.[0] !== undefined
    && altPrintable[1] !== undefined
    && !terminalControlIntroducers.has(altPrintable[1])
  ) {
    const character = altPrintable[1];
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      const key = printableKeyName(character);
      return normalizeKeyEvent({
        key,
        keyCodePoint: codePoint,
        sequence: altPrintable[0],
        modifiers: { alt: true, shift: key !== 'unknown' && character !== character.toLowerCase() }
      });
    }
  }
  const altControl = altControlKeyFromPrefix(value);
  if (altControl !== undefined) return altControl;
  const control = controlKeyFromPrefix(value);
  if (control !== undefined) return control;
  if (value === '\u001B') return normalizeKeyEvent({ key: 'escape', sequence: value });
  return undefined;
}

export function keyEvent(
  key: KeyName,
  sequence: string,
  options: Pick<KeyEventLike, 'location' | 'modifiers'> = {}
): KeyEvent {
  return normalizeKeyEvent({ key, sequence, ...options });
}

function controlKeyFromPrefix(value: string): KeyEvent | undefined {
  const code = value.codePointAt(0);
  if (code === undefined || code < 0 || code > 31) return undefined;
  const sequence = value[0];
  if (sequence === undefined) return undefined;
  if (code === 0) return normalizeKeyEvent({ key: 'space', sequence, modifiers: { ctrl: true } });
  if (code === 9 || code === 10 || code === 13 || code === 27 || code === 8) return undefined;
  if (code >= 28 && code <= 31) {
    const keyCodePoint = [92, 93, 94, 95][code - 28];
    if (keyCodePoint === undefined) return undefined;
    return normalizeKeyEvent({
      key: 'unknown',
      keyCodePoint,
      sequence,
      modifiers: { ctrl: true }
    });
  }
  const key = String.fromCharCode(96 + code) as LetterKeyName;
  return normalizeKeyEvent({ key, sequence, modifiers: { ctrl: true } });
}

function altControlKeyFromPrefix(value: string): KeyEvent | undefined {
  if (!value.startsWith('\u001B') || value.length < 2) return undefined;
  const nested = controlKeyFromPrefix(value.slice(1));
  return nested === undefined ? undefined : normalizeKeyEvent({
    ...nested,
    sequence: value.slice(0, 2),
    modifiers: { ...nested.modifiers, alt: true }
  });
}

function printableKeyName(value: string): KeyName {
  const lower = value.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return lower as LetterKeyName;
  if (value >= '0' && value <= '9') return value as KeyName;
  if (value === ' ') return 'space';
  if (value === '=') return 'equal';
  return 'unknown';
}

function modifiedKeyFromPrefix(value: string): KeyEvent | undefined {
  const finalMatch = modifiedNavigationFinalPattern.exec(value);
  if (finalMatch?.[0] !== undefined) {
    const key = finalNavigationKeys.get(finalMatch[2] ?? '');
    if (key !== undefined) {
      return normalizeKeyEvent({ key, sequence: finalMatch[0], modifiers: modifierFlags(finalMatch[1]) });
    }
  }
  const tildeMatch = modifiedTildePattern.exec(value);
  if (tildeMatch?.[0] !== undefined) {
    const key = tildeKeys.get(tildeMatch[1] ?? '');
    if (key !== undefined) {
      return normalizeKeyEvent({ key, sequence: tildeMatch[0], modifiers: modifierFlags(tildeMatch[2]) });
    }
  }
  return undefined;
}

function modifierFlags(value: string | undefined): Partial<KeyModifiers> {
  const parameter = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parameter) || parameter < 2) return {};
  const flags = parameter - 1;
  return {
    shift: (flags & 1) !== 0,
    alt: (flags & 2) !== 0,
    ctrl: (flags & 4) !== 0,
    meta: (flags & 8) !== 0
  };
}

function normalizeModifiers(modifiers: Partial<KeyModifiers> | undefined): KeyModifiers {
  return {
    ctrl: modifiers?.ctrl ?? false,
    alt: modifiers?.alt ?? false,
    shift: modifiers?.shift ?? false,
    meta: modifiers?.meta ?? false,
    ...(modifiers?.super === true ? { super: true as const } : {}),
    ...(modifiers?.hyper === true ? { hyper: true as const } : {}),
    ...(modifiers?.capsLock === true ? { capsLock: true as const } : {}),
    ...(modifiers?.numLock === true ? { numLock: true as const } : {})
  };
}
