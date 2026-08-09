import type { InputEvent, KeyEvent } from '../input/index.ts';

const keySequences = new Map<string, string>([
  ['enter', '\r'],
  ['escape', '\u001B'],
  ['tab', '\t'],
  ['backspace', '\u007F'],
  ['delete', '\u001B[3~'],
  ['arrowUp', '\u001B[A'],
  ['arrowDown', '\u001B[B'],
  ['arrowLeft', '\u001B[D'],
  ['arrowRight', '\u001B[C'],
  ['pageUp', '\u001B[5~'],
  ['pageDown', '\u001B[6~'],
  ['home', '\u001B[H'],
  ['end', '\u001B[F'],
  ['insert', '\u001B[2~'],
  ['space', ' '],
  ['f1', '\u001BOP'],
  ['f2', '\u001BOQ'],
  ['f3', '\u001BOR'],
  ['f4', '\u001BOS'],
  ['f5', '\u001B[15~'],
  ['f6', '\u001B[17~'],
  ['f7', '\u001B[18~'],
  ['f8', '\u001B[19~'],
  ['f9', '\u001B[20~'],
  ['f10', '\u001B[21~'],
  ['f11', '\u001B[23~'],
  ['f12', '\u001B[24~'],
  ['f13', '\u001B[25~'],
  ['f14', '\u001B[26~'],
  ['f15', '\u001B[28~'],
  ['f16', '\u001B[29~'],
  ['f17', '\u001B[31~'],
  ['f18', '\u001B[32~'],
  ['f19', '\u001B[33~'],
  ['f20', '\u001B[34~']
]);

const shiftedKeySequences = new Map<string, string>([
  ['tab', '\u001B[Z'],
  ['arrowUp', '\u001B[1;2A'],
  ['arrowDown', '\u001B[1;2B'],
  ['arrowLeft', '\u001B[1;2D'],
  ['arrowRight', '\u001B[1;2C'],
  ['pageUp', '\u001B[5;2~'],
  ['pageDown', '\u001B[6;2~'],
  ['home', '\u001B[1;2H'],
  ['end', '\u001B[1;2F']
]);

export function encodeHarnessInputEvent(event: InputEvent): string {
  switch (event.kind) {
    case 'text':
      return event.text;
    case 'paste':
      return event.bracketed ? `\u001B[200~${event.text}\u001B[201~` : event.text;
    case 'key':
      return encodeKeyEvent(event);
    case 'mouse':
    case 'unknown':
      return event.sequence;
    case 'focus':
      return event.focused ? '\u001B[I' : '\u001B[O';
  }
}

function encodeKeyEvent(event: KeyEvent): string {
  if (event.sequence !== undefined) return event.sequence;
  if (event.eventType !== 'press') {
    throw new TypeError(`Testing harness cannot encode a ${event.eventType} key without an explicit sequence.`);
  }
  const control = controlSequence(event);
  if (control !== undefined) return control;
  if (onlyModifiers(event, { alt: true, shift: event.modifiers.shift }) && /^[a-z]$/u.test(event.key)) {
    return `\u001B${event.modifiers.shift ? event.key.toUpperCase() : event.key}`;
  }
  if (onlyModifiers(event, { shift: true })) {
    const shifted = shiftedKeySequences.get(event.key);
    if (shifted !== undefined) return shifted;
  }
  if (onlyModifiers(event, {})) {
    const encoded = keySequences.get(event.key);
    if (encoded !== undefined) return encoded;
  }
  throw new TypeError(
    `Testing harness cannot encode key "${event.key}" with this legacy profile; provide its terminal sequence.`,
  );
}

function controlSequence(event: KeyEvent): string | undefined {
  if (!onlyModifiers(event, { ctrl: true }) || !/^[a-z]$/u.test(event.key)) return undefined;
  return String.fromCharCode(event.key.charCodeAt(0) - 96);
}

function onlyModifiers(
  event: KeyEvent,
  expected: { readonly ctrl?: boolean; readonly alt?: boolean; readonly shift?: boolean },
): boolean {
  return event.modifiers.ctrl === (expected.ctrl ?? false)
    && event.modifiers.alt === (expected.alt ?? false)
    && event.modifiers.shift === (expected.shift ?? false)
    && !event.modifiers.meta
    && event.modifiers.super !== true
    && event.modifiers.hyper !== true
    && event.modifiers.capsLock !== true
    && event.modifiers.numLock !== true;
}
