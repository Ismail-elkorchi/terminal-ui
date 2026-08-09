import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember
} from '../foundation/validation.ts';
import {
  keyEventTypes,
  keyLocations,
  keyNames,
  mouseActions,
  mouseButtons,
  mouseEncodings,
  mousePointerButtons,
  mouseWheelButtons
} from './types.ts';
import type {
  InputEvent,
  KeyAlternateCodePoints,
  KeyModifiers,
  MouseModifiers,
  RecordedInputEvent
} from './types.ts';

const keyEventFields = new Set([
  'kind',
  'key',
  'keyCodePoint',
  'sequence',
  'modifiers',
  'eventType',
  'location',
  'alternateCodePoints',
  'committedText'
]);
const keyModifierFields = new Set([
  'ctrl', 'alt', 'shift', 'meta', 'super', 'hyper', 'capsLock', 'numLock'
]);
const alternateCodePointFields = new Set(['shifted', 'baseLayout']);
const textEventFields = new Set(['kind', 'text', 'paste']);
const pasteEventFields = new Set(['kind', 'text', 'bracketed']);
const mouseEventFields = new Set([
  'kind',
  'sequence',
  'encoding',
  'action',
  'button',
  'row',
  'column',
  'rawCode',
  'modifiers'
]);
const mouseWheelEventFields = new Set([...mouseEventFields, 'deltaRows', 'deltaColumns']);
const mouseModifierFields = new Set(['shift', 'alt', 'ctrl']);
const resizeEventFields = new Set(['kind', 'terminalSize']);
const terminalSizeFields = new Set(['columns', 'rows']);
const focusEventFields = new Set(['kind', 'focused']);
const signalEventFields = new Set(['kind', 'signal']);
const terminalSignals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'resize'] as const;
const endEventFields = new Set(['kind']);
const unknownEventFields = new Set(['kind', 'sequence']);

export function decodeRecordedInputEvent(value: unknown): RecordedInputEvent {
  if (!isNonArrayObject(value)) throw new TypeError('input event must be an object.');
  switch (value['kind']) {
    case 'key':
      return decodeKeyEvent(value);
    case 'text': {
      assertExactFields(value, textEventFields, 'input event');
      if (typeof value['text'] !== 'string' || value['paste'] !== false) {
        throw new TypeError('text event requires text and paste:false.');
      }
      return Object.freeze({ kind: 'text', text: value['text'], paste: false });
    }
    case 'paste': {
      assertExactFields(value, pasteEventFields, 'input event');
      if (typeof value['text'] !== 'string' || typeof value['bracketed'] !== 'boolean') {
        throw new TypeError('paste event requires text and bracketed.');
      }
      return Object.freeze({ kind: 'paste', text: value['text'], bracketed: value['bracketed'] });
    }
    case 'mouse':
      return decodeMouseEvent(value);
    case 'resize': {
      assertExactFields(value, resizeEventFields, 'input event');
      const terminalSize = value['terminalSize'];
      if (!isNonArrayObject(terminalSize)) throw new TypeError('terminal size must be an object.');
      assertExactFields(terminalSize, terminalSizeFields, 'terminal size');
      const columns = terminalSize['columns'];
      const rows = terminalSize['rows'];
      if (!isPositiveSafeInteger(columns) || !isPositiveSafeInteger(rows)) {
        throw new RangeError('terminal size columns and rows must be positive integers.');
      }
      return Object.freeze({
        kind: 'resize',
        terminalSize: Object.freeze({ columns, rows })
      });
    }
    case 'focus': {
      assertExactFields(value, focusEventFields, 'input event');
      if (typeof value['focused'] !== 'boolean') {
        throw new TypeError('focus event requires focused.');
      }
      return Object.freeze({ kind: 'focus', focused: value['focused'] });
    }
    case 'signal': {
      assertExactFields(value, signalEventFields, 'input event');
      if (!isStringMember(value['signal'], terminalSignals)) {
        throw new TypeError('signal event requires a supported terminal signal.');
      }
      return Object.freeze({ kind: 'signal', signal: value['signal'] });
    }
    case 'end':
      assertExactFields(value, endEventFields, 'input event');
      return Object.freeze({ kind: 'end' });
    case 'unknown': {
      assertExactFields(value, unknownEventFields, 'input event');
      if (typeof value['sequence'] !== 'string') {
        throw new TypeError('unknown event requires sequence.');
      }
      return Object.freeze({ kind: 'unknown', sequence: value['sequence'] });
    }
    default:
      throw new TypeError(`unsupported input event kind: ${String(value['kind'])}.`);
  }
}

export function snapshotInputEvent(event: InputEvent): InputEvent;
export function snapshotInputEvent(event: RecordedInputEvent): RecordedInputEvent;
export function snapshotInputEvent(event: RecordedInputEvent): RecordedInputEvent {
  return decodeRecordedInputEvent(event);
}

function decodeKeyEvent(value: Readonly<Record<string, unknown>>): InputEvent {
  assertExactFields(value, keyEventFields, 'input event');
  const key = value['key'];
  if (!isStringMember(key, keyNames)) {
    throw new TypeError(`unsupported key name: ${String(key)}.`);
  }
  const keyCodePoint = value['keyCodePoint'];
  if (keyCodePoint !== undefined && !isUnicodeScalar(keyCodePoint)) {
    throw new RangeError('key code point is invalid.');
  }
  const sequence = value['sequence'];
  if (sequence !== undefined && typeof sequence !== 'string') {
    throw new TypeError('key sequence must be a string.');
  }
  const eventType = value['eventType'];
  if (!isStringMember(eventType, keyEventTypes)) {
    throw new TypeError('key event requires eventType.');
  }
  const location = value['location'];
  if (!isStringMember(location, keyLocations)) {
    throw new TypeError('key event requires location.');
  }
  const committedText = value['committedText'];
  if (committedText !== undefined && typeof committedText !== 'string') {
    throw new TypeError('key committedText must be a string.');
  }
  const alternateCodePoints = value['alternateCodePoints'] === undefined
    ? undefined
    : decodeAlternateCodePoints(value['alternateCodePoints']);
  return Object.freeze({
    kind: 'key',
    key,
    ...(keyCodePoint === undefined ? {} : { keyCodePoint }),
    ...(sequence === undefined ? {} : { sequence }),
    modifiers: decodeKeyModifiers(value['modifiers']),
    eventType,
    location,
    ...(alternateCodePoints === undefined ? {} : { alternateCodePoints }),
    ...(committedText === undefined ? {} : { committedText })
  });
}

function decodeAlternateCodePoints(value: unknown): KeyAlternateCodePoints {
  if (!isNonArrayObject(value)) {
    throw new TypeError('key alternateCodePoints must be an object.');
  }
  assertExactFields(value, alternateCodePointFields, 'key alternateCodePoints');
  const shifted = value['shifted'];
  const baseLayout = value['baseLayout'];
  if (shifted === undefined && baseLayout === undefined) {
    throw new TypeError('key alternateCodePoints requires shifted or baseLayout.');
  }
  if (shifted !== undefined && !isUnicodeScalar(shifted)) {
    throw new RangeError('key shifted alternate code point is invalid.');
  }
  if (baseLayout !== undefined && !isUnicodeScalar(baseLayout)) {
    throw new RangeError('key base-layout alternate code point is invalid.');
  }
  return Object.freeze({
    ...(shifted === undefined ? {} : { shifted }),
    ...(baseLayout === undefined ? {} : { baseLayout })
  });
}

function decodeKeyModifiers(value: unknown): KeyModifiers {
  if (!isNonArrayObject(value)) throw new TypeError('key event requires modifiers.');
  assertExactFields(value, keyModifierFields, 'key modifiers');
  const ctrl = requiredBoolean(value, 'ctrl', 'key modifiers');
  const alt = requiredBoolean(value, 'alt', 'key modifiers');
  const shift = requiredBoolean(value, 'shift', 'key modifiers');
  const meta = requiredBoolean(value, 'meta', 'key modifiers');
  for (const modifier of ['super', 'hyper', 'capsLock', 'numLock'] as const) {
    if (value[modifier] !== undefined && value[modifier] !== true) {
      throw new TypeError(`key modifier ${modifier} must be true when present.`);
    }
  }
  return Object.freeze({
    ctrl,
    alt,
    shift,
    meta,
    ...(value['super'] === true ? { super: true as const } : {}),
    ...(value['hyper'] === true ? { hyper: true as const } : {}),
    ...(value['capsLock'] === true ? { capsLock: true as const } : {}),
    ...(value['numLock'] === true ? { numLock: true as const } : {})
  });
}

function decodeMouseEvent(value: Readonly<Record<string, unknown>>): InputEvent {
  const action = value['action'];
  assertExactFields(
    value,
    action === 'wheel' ? mouseWheelEventFields : mouseEventFields,
    'input event'
  );
  const sequence = value['sequence'];
  if (typeof sequence !== 'string') throw new TypeError('mouse event requires sequence.');
  const encoding = value['encoding'];
  if (!isStringMember(encoding, mouseEncodings)) {
    throw new TypeError(`unsupported mouse encoding: ${String(encoding)}.`);
  }
  if (!isStringMember(action, mouseActions)) {
    throw new TypeError(`unsupported mouse action: ${String(action)}.`);
  }
  const button = value['button'];
  if (!isStringMember(button, mouseButtons)) {
    throw new TypeError(`unsupported mouse button: ${String(button)}.`);
  }
  const row = value['row'];
  const column = value['column'];
  if (!isPositiveSafeInteger(row) || !isPositiveSafeInteger(column)) {
    throw new RangeError('mouse event row and column must be positive integers.');
  }
  const rawCode = value['rawCode'];
  if (!isSafeInteger(rawCode)) {
    throw new RangeError('mouse event rawCode must be an integer.');
  }
  const modifiers = decodeMouseModifiers(value['modifiers']);
  if (action === 'wheel') {
    if (!isStringMember(button, mouseWheelButtons)) {
      throw new TypeError('wheel event requires a wheel-compatible button.');
    }
    const deltaRows = value['deltaRows'];
    const deltaColumns = value['deltaColumns'];
    if (
      typeof deltaRows !== 'number'
      || !Number.isFinite(deltaRows)
      || typeof deltaColumns !== 'number'
      || !Number.isFinite(deltaColumns)
    ) throw new RangeError('wheel event requires finite deltaRows and deltaColumns.');
    return Object.freeze({
      kind: 'mouse',
      sequence,
      encoding,
      action,
      button,
      row,
      column,
      rawCode,
      modifiers,
      deltaRows,
      deltaColumns
    });
  }
  if (!isStringMember(button, mousePointerButtons)) {
    throw new TypeError('pointer event requires a pointer-compatible button.');
  }
  return Object.freeze({
    kind: 'mouse',
    sequence,
    encoding,
    action,
    button,
    row,
    column,
    rawCode,
    modifiers
  });
}

function decodeMouseModifiers(value: unknown): MouseModifiers {
  if (!isNonArrayObject(value)) throw new TypeError('mouse event requires modifiers.');
  assertExactFields(value, mouseModifierFields, 'mouse modifiers');
  return Object.freeze({
    shift: requiredBoolean(value, 'shift', 'mouse modifiers'),
    alt: requiredBoolean(value, 'alt', 'mouse modifiers'),
    ctrl: requiredBoolean(value, 'ctrl', 'mouse modifiers')
  });
}

function requiredBoolean(
  value: Readonly<Record<string, unknown>>,
  field: string,
  label: string
): boolean {
  const member = value[field];
  if (typeof member !== 'boolean') throw new TypeError(`${label} require ${field}.`);
  return member;
}

function assertExactFields(
  value: Readonly<Record<string, unknown>>,
  fields: ReadonlySet<string>,
  label: string
): void {
  const unsupported = findUnsupportedField(value, fields);
  if (unsupported !== undefined) {
    throw new TypeError(`${label} contains unsupported field: ${unsupported}.`);
  }
}

function isUnicodeScalar(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && typeof value === 'number'
    && value >= 0
    && value <= 0x10ffff
    && !(value >= 0xd800 && value <= 0xdfff);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 1;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
