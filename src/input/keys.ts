import type { InputEvent, KeyEvent, KeyEventLike, KeyName } from './types.ts';

const modifiedNavigationFinalPattern = new RegExp(String.raw`^\u001B\[1;(\d+)([ABCDFH])`, 'u');
const modifiedNavigationTildePattern = new RegExp(String.raw`^\u001B\[(\d+);(\d+)~`, 'u');

export const keySequences: ReadonlyMap<string, KeyName> = new Map([
  ['\u001B[3~', 'delete'],
  ['\u001B[5~', 'pageUp'],
  ['\u001B[6~', 'pageDown'],
  ['\u001B[A', 'arrowUp'],
  ['\u001B[B', 'arrowDown'],
  ['\u001B[C', 'arrowRight'],
  ['\u001B[D', 'arrowLeft'],
  ['\u001B[H', 'home'],
  ['\u001B[F', 'end'],
  ['\u001BOH', 'home'],
  ['\u001BOF', 'end'],
  ['\u001B[1~', 'home'],
  ['\u001B[4~', 'end'],
  ['\r', 'enter'],
  ['\n', 'enter'],
  ['\t', 'tab'],
  ['\u0003', 'ctrlC'],
  ['\u0004', 'ctrlD'],
  ['\u007F', 'backspace'],
  ['\b', 'backspace']
]);

const finalNavigationKeys: ReadonlyMap<string, KeyName> = new Map([
  ['A', 'arrowUp'],
  ['B', 'arrowDown'],
  ['C', 'arrowRight'],
  ['D', 'arrowLeft'],
  ['H', 'home'],
  ['F', 'end']
]);

const tildeNavigationKeys: ReadonlyMap<string, KeyName> = new Map([
  ['1', 'home'],
  ['3', 'delete'],
  ['4', 'end'],
  ['5', 'pageUp'],
  ['6', 'pageDown']
]);

export function normalizeKeyEvent(event: KeyEventLike): KeyEvent {
  return {
    kind: 'key',
    key: event.key,
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    ctrl: event.ctrl ?? false,
    alt: event.alt ?? false,
    shift: event.shift ?? false,
    meta: event.meta ?? false,
    ...(event.repeat === undefined ? {} : { repeat: event.repeat })
  };
}

export function isCancelKey(event: InputEvent): boolean {
  return event.kind === 'key' && event.key === 'escape';
}

export function isInterruptKey(event: InputEvent): boolean {
  return event.kind === 'key' && event.key === 'ctrlC';
}

export function keyFromPrefix(value: string): KeyEvent | undefined {
  const modified = modifiedNavigationKeyFromPrefix(value);
  if (modified !== undefined) return modified;
  if (value.startsWith('\u001B[Z')) return normalizeKeyEvent({ key: 'tab', sequence: '\u001B[Z', shift: true });
  for (const [sequence, key] of keySequences) {
    if (value.startsWith(sequence)) return normalizeKeyEvent({ key, sequence });
  }
  if (value === '\u001B') return normalizeKeyEvent({ key: 'escape', sequence: value });
  return undefined;
}

export function keyEvent(key: KeyName, sequence: string): KeyEvent {
  return normalizeKeyEvent({ key, sequence, ctrl: key === 'ctrlC' || key === 'ctrlD' });
}

function modifiedNavigationKeyFromPrefix(value: string): KeyEvent | undefined {
  const finalMatch = modifiedNavigationFinalPattern.exec(value);
  if (finalMatch?.[0] !== undefined) {
    const key = finalNavigationKeys.get(finalMatch[2] ?? '');
    if (key !== undefined) {
      return normalizeKeyEvent({
        key,
        sequence: finalMatch[0],
        ...modifierFlags(finalMatch[1])
      });
    }
  }

  const tildeMatch = modifiedNavigationTildePattern.exec(value);
  if (tildeMatch?.[0] !== undefined) {
    const key = tildeNavigationKeys.get(tildeMatch[1] ?? '');
    if (key !== undefined) {
      return normalizeKeyEvent({
        key,
        sequence: tildeMatch[0],
        ...modifierFlags(tildeMatch[2])
      });
    }
  }

  return undefined;
}

function modifierFlags(value: string | undefined): Pick<KeyEventLike, 'alt' | 'ctrl' | 'meta' | 'shift'> {
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
