import type { MouseReportingMode } from '../host/index.ts';
import type { MouseAction, MouseButton, MouseEncoding, MouseEvent } from './types.ts';
import { InputDecodeError } from './decode-error.ts';

const sgrMousePattern = new RegExp(String.raw`^\u001B\[<(\d+);(\d+);(\d+)([Mm])`, 'u');

export function mouseFromPrefix(
  value: string,
  maxFieldDigits: number,
  reportingMode: Exclude<MouseReportingMode, 'none'>
): { readonly event: MouseEvent; readonly length: number } | undefined {
  const sgr = sgrMousePattern.exec(value);
  if (sgr?.[0] !== undefined) {
    const fields = [sgr[1] ?? '', sgr[2] ?? '', sgr[3] ?? ''];
    const oversized = fields.find((field) => field.length > maxFieldDigits);
    if (oversized !== undefined) {
      throw new InputDecodeError('mouse_field_limit_exceeded', maxFieldDigits, oversized.length);
    }
    const rawCode = Number.parseInt(fields[0] ?? '', 10);
    const column = Number.parseInt(fields[1] ?? '', 10);
    const row = Number.parseInt(fields[2] ?? '', 10);
    const final = sgr[4];
    if (
      Number.isSafeInteger(rawCode)
      && Number.isSafeInteger(column)
      && Number.isSafeInteger(row)
      && rawCode >= 0
      && rawCode <= 255
      && column > 0
      && row > 0
    ) {
      const event = mouseEvent({
          sequence: sgr[0],
          encoding: 'sgr',
          rawCode,
          column,
          row,
          released: final === 'm'
        });
      return modeAllowsEvent(reportingMode, event.action)
        ? { event, length: sgr[0].length }
        : undefined;
    }
  }
  return undefined;
}

function modeAllowsEvent(mode: Exclude<MouseReportingMode, 'none'>, action: MouseAction): boolean {
  if (action === 'move') return mode === 'all';
  if (action === 'drag') return mode === 'drag' || mode === 'all';
  return true;
}

function mouseEvent(options: {
  readonly sequence: string;
  readonly encoding: MouseEncoding;
  readonly rawCode: number;
  readonly row: number;
  readonly column: number;
  readonly released: boolean;
}): MouseEvent {
  const baseCode = options.rawCode & 0b11;
  const action = mouseAction(options.rawCode, options.released);
  const button = mouseButton(options.rawCode, baseCode, options.released);
  if (action === 'wheel') {
    return {
      kind: 'mouse',
      sequence: options.sequence,
      encoding: options.encoding,
      action,
      button: wheelButton(button),
      row: options.row,
      column: options.column,
      rawCode: options.rawCode,
      modifiers: mouseModifiers(options.rawCode),
      deltaRows: button === 'wheelUp' ? -1 : button === 'wheelDown' ? 1 : 0,
      deltaColumns: button === 'wheelLeft' ? -1 : button === 'wheelRight' ? 1 : 0
    };
  }
  return {
    kind: 'mouse',
    sequence: options.sequence,
    encoding: options.encoding,
    action,
    button: pointerButton(button),
    row: options.row,
    column: options.column,
    rawCode: options.rawCode,
    modifiers: mouseModifiers(options.rawCode)
  };
}

function mouseModifiers(rawCode: number): MouseEvent['modifiers'] {
  return {
    shift: (rawCode & 4) !== 0,
    alt: (rawCode & 8) !== 0,
    ctrl: (rawCode & 16) !== 0
  };
}

function wheelButton(button: MouseButton): Extract<MouseEvent, { readonly action: 'wheel' }>['button'] {
  switch (button) {
    case 'wheelUp':
    case 'wheelDown':
    case 'wheelLeft':
    case 'wheelRight':
      return button;
    default:
      return 'unknown';
  }
}

function pointerButton(button: MouseButton): Extract<MouseEvent, { readonly action: Exclude<MouseAction, 'wheel'> }>['button'] {
  switch (button) {
    case 'left':
    case 'middle':
    case 'right':
    case 'none':
      return button;
    default:
      return 'unknown';
  }
}

function mouseAction(rawCode: number, released: boolean): MouseAction {
  if (released) return 'release';
  if ((rawCode & 64) !== 0) return 'wheel';
  if ((rawCode & 32) !== 0) return (rawCode & 0b11) === 3 ? 'move' : 'drag';
  return 'press';
}

function mouseButton(rawCode: number, baseCode: number, released: boolean): MouseButton {
  if (released) return 'none';
  if ((rawCode & 64) !== 0) {
    if (baseCode === 0) return 'wheelUp';
    if (baseCode === 1) return 'wheelDown';
    if (baseCode === 2) return 'wheelLeft';
    if (baseCode === 3) return 'wheelRight';
    return 'unknown';
  }
  switch (baseCode) {
    case 0:
      return 'left';
    case 1:
      return 'middle';
    case 2:
      return 'right';
    case 3:
      return 'none';
  }
  return 'unknown';
}
