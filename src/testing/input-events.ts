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
  ['f12', '\u001B[24~']
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

export function encodeHarnessInputEvent(event: InputEvent): string | undefined {
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
    case 'resize':
    case 'signal':
    case 'end':
      return undefined;
  }
}

function encodeKeyEvent(event: KeyEvent): string | undefined {
  if (event.sequence !== undefined) return event.sequence;
  const control = controlSequence(event);
  if (control !== undefined) return control;
  if (event.modifiers.alt && /^[a-z]$/u.test(event.key)) {
    return `\u001B${event.modifiers.shift ? event.key.toUpperCase() : event.key}`;
  }
  if (event.modifiers.shift) {
    const shifted = shiftedKeySequences.get(event.key);
    if (shifted !== undefined) return shifted;
  }
  return keySequences.get(event.key);
}

function controlSequence(event: KeyEvent): string | undefined {
  if (!event.modifiers.ctrl || !/^[a-z]$/u.test(event.key)) return undefined;
  return String.fromCharCode(event.key.charCodeAt(0) - 96);
}
