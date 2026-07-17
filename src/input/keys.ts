import type {
  InputEvent,
  KeyEvent,
  KeyEventLike,
  KeyLocation,
  KeyModifiers,
  KeyName,
  LetterKeyName
} from './types.ts';

const modifiedNavigationFinalPattern = new RegExp(String.raw`^\u001B\[1;(\d+)([ABCDFH])`, 'u');
const modifiedTildePattern = new RegExp(String.raw`^\u001B\[(\d+);(\d+)~`, 'u');
const altLetterPattern = new RegExp(String.raw`^\u001B([A-Za-z])`, 'u');

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
  ['\u001BOH', { key: 'home' }],
  ['\u001BOF', { key: 'end' }],
  ['\u001B[1~', { key: 'home' }],
  ['\u001B[4~', { key: 'end' }],
  ['\u001BOP', { key: 'f1' }],
  ['\u001BOQ', { key: 'f2' }],
  ['\u001BOR', { key: 'f3' }],
  ['\u001BOS', { key: 'f4' }],
  ['\u001B[15~', { key: 'f5' }],
  ['\u001B[17~', { key: 'f6' }],
  ['\u001B[18~', { key: 'f7' }],
  ['\u001B[19~', { key: 'f8' }],
  ['\u001B[20~', { key: 'f9' }],
  ['\u001B[21~', { key: 'f10' }],
  ['\u001B[23~', { key: 'f11' }],
  ['\u001B[24~', { key: 'f12' }],
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
  ['D', 'arrowLeft'], ['H', 'home'], ['F', 'end']
]);

const tildeKeys: ReadonlyMap<string, KeyName> = new Map([
  ['1', 'home'], ['2', 'insert'], ['3', 'delete'], ['4', 'end'],
  ['5', 'pageUp'], ['6', 'pageDown'], ['15', 'f5'], ['17', 'f6'],
  ['18', 'f7'], ['19', 'f8'], ['20', 'f9'], ['21', 'f10'],
  ['23', 'f11'], ['24', 'f12']
]);

export function normalizeKeyEvent(event: KeyEventLike): KeyEvent {
  return {
    kind: 'key',
    key: event.key,
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    modifiers: normalizeModifiers(event.modifiers),
    eventType: event.eventType ?? 'press',
    location: event.location ?? 'standard'
  };
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
  const altLetter = altLetterPattern.exec(value);
  if (altLetter?.[0] !== undefined && altLetter[1] !== undefined) {
    const letter = altLetter[1].toLowerCase() as LetterKeyName;
    return normalizeKeyEvent({ key: letter, sequence: altLetter[0], modifiers: { alt: true, shift: altLetter[1] !== letter } });
  }
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
  if (code === undefined || code < 0 || code > 26) return undefined;
  const sequence = value[0];
  if (sequence === undefined) return undefined;
  if (code === 0) return normalizeKeyEvent({ key: 'space', sequence, modifiers: { ctrl: true } });
  if (code === 9 || code === 10 || code === 13 || code === 27 || code === 8) return undefined;
  const key = String.fromCharCode(96 + code) as LetterKeyName;
  return normalizeKeyEvent({ key, sequence, modifiers: { ctrl: true } });
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
    meta: modifiers?.meta ?? false
  };
}
