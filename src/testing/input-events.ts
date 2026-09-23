import type {
  InputEvent,
  KeyEvent,
  KeyEventLike,
  MouseModifiers,
  MousePointerButton,
  MousePointerEvent,
  MouseAction,
  MouseWheelButton,
  MouseWheelEvent,
  PasteEvent,
} from '../input/index.ts';

const noKeyModifiers = Object.freeze({ ctrl: false, alt: false, shift: false, meta: false });
const noMouseModifiers = Object.freeze({ ctrl: false, alt: false, shift: false });

export function keyInput(
  key: KeyEventLike['key'],
  options: Omit<KeyEventLike, 'key'> = {},
): KeyEvent {
  const modifiers = Object.freeze({ ...noKeyModifiers, ...options.modifiers });
  const printable = key.length === 1 && /^[ -~]$/u.test(key)
    && !modifiers.ctrl && !modifiers.alt && !modifiers.meta
    && modifiers.super !== true && modifiers.hyper !== true;
  const committedText = options.committedText
    ?? (printable && options.eventType !== 'release'
      ? modifiers.shift ? key.toUpperCase() : key
      : undefined);
  return Object.freeze({
    kind: 'key',
    key,
    modifiers,
    eventType: options.eventType ?? 'press',
    location: options.location ?? 'standard',
    ...(options.keyCodePoint === undefined ? {} : { keyCodePoint: options.keyCodePoint }),
    ...(options.sequence === undefined ? {} : { sequence: options.sequence }),
    ...(options.alternateCodePoints === undefined ? {} : {
      alternateCodePoints: Object.freeze({ ...options.alternateCodePoints }),
    }),
    ...(committedText === undefined ? {} : { committedText }),
  });
}

export function pasteInput(text: string, bracketed = true): PasteEvent {
  return Object.freeze({ kind: 'paste', text, bracketed });
}

export function pointerInput(input: {
  readonly action: Exclude<MouseAction, 'wheel'>;
  readonly row: number;
  readonly column: number;
  readonly button?: MousePointerButton;
  readonly modifiers?: Partial<MouseModifiers>;
}): MousePointerEvent {
  return Object.freeze({
    kind: 'mouse',
    action: input.action,
    row: input.row,
    column: input.column,
    button: input.button ?? (input.action === 'move' ? 'none' : 'left'),
    modifiers: Object.freeze({ ...noMouseModifiers, ...input.modifiers }),
    encoding: 'sgr',
    sequence: '',
    rawCode: 0,
  });
}

export function wheelInput(input: {
  readonly row: number;
  readonly column: number;
  readonly deltaRows?: number;
  readonly deltaColumns?: number;
  readonly button?: MouseWheelButton;
  readonly modifiers?: Partial<MouseModifiers>;
}): MouseWheelEvent {
  const deltaRows = input.deltaRows ?? 0;
  const deltaColumns = input.deltaColumns ?? 0;
  return Object.freeze({
    kind: 'mouse',
    action: 'wheel',
    row: input.row,
    column: input.column,
    button: input.button ?? (deltaRows < 0
      ? 'wheelUp'
      : deltaRows > 0
        ? 'wheelDown'
        : deltaColumns < 0
          ? 'wheelLeft'
          : 'wheelRight'),
    deltaRows,
    deltaColumns,
    modifiers: Object.freeze({ ...noMouseModifiers, ...input.modifiers }),
    encoding: 'sgr',
    sequence: '',
    rawCode: 0,
  });
}

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
      return encodeMouseEvent(event);
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
    if (event.key.length === 1 && /^[a-z]$/u.test(event.key)) return event.key.toUpperCase();
  }
  if (onlyModifiers(event, {})) {
    const encoded = keySequences.get(event.key);
    if (encoded !== undefined) return encoded;
    if (event.key.length === 1 && /^[ -~]$/u.test(event.key)) return event.key;
  }
  throw new TypeError(
    `Testing harness cannot encode key "${event.key}" with this legacy profile; provide its terminal sequence.`,
  );
}

function encodeMouseEvent(event: MousePointerEvent | MouseWheelEvent): string {
  if (!Number.isSafeInteger(event.row) || event.row < 1
    || !Number.isSafeInteger(event.column) || event.column < 1) {
    throw new RangeError('Testing harness mouse coordinates must be positive safe integers.');
  }
  const modifiers = (event.modifiers.shift ? 4 : 0)
    + (event.modifiers.alt ? 8 : 0)
    + (event.modifiers.ctrl ? 16 : 0);
  const packet = (code: number, suffix = 'M') =>
    `\u001B[<${String(code + modifiers)};${String(event.column)};${String(event.row)}${suffix}`;
  if (event.action === 'wheel') {
    const rows = event.deltaRows;
    const columns = event.deltaColumns;
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns)) {
      throw new RangeError('Testing harness wheel deltas must be safe integers.');
    }
    if (rows === 0 && columns === 0) {
      throw new RangeError('Testing harness wheel event must have a non-zero delta.');
    }
    if (Math.abs(rows) + Math.abs(columns) > 1_024) {
      throw new RangeError('Testing harness wheel event exceeds 1,024 steps.');
    }
    return packet(rows < 0 ? 64 : 65).repeat(Math.abs(rows))
      + packet(columns < 0 ? 66 : 67).repeat(Math.abs(columns));
  }
  const button = event.button === 'left' ? 0
    : event.button === 'middle' ? 1
      : event.button === 'right' ? 2
        : event.button === 'none' ? 3
          : undefined;
  if (button === undefined) throw new TypeError('Testing harness cannot encode this pointer button.');
  if (event.action === 'press') return packet(button);
  if (event.action === 'release') return packet(button, 'm');
  return packet(button + 32);
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
