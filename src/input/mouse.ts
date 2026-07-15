import type { MouseAction, MouseButton, MouseEncoding, MouseEvent } from './types.ts';

const sgrMousePattern = new RegExp(String.raw`^\u001B\[<(\d+);(\d+);(\d+)([Mm])`, 'u');

export function mouseFromPrefix(
  value: string
): { readonly event: MouseEvent; readonly length: number } | undefined {
  const sgr = sgrMousePattern.exec(value);
  if (sgr?.[0] !== undefined) {
    const rawCode = Number.parseInt(sgr[1] ?? '', 10);
    const column = Number.parseInt(sgr[2] ?? '', 10);
    const row = Number.parseInt(sgr[3] ?? '', 10);
    const final = sgr[4];
    if (Number.isFinite(rawCode) && Number.isFinite(column) && Number.isFinite(row)) {
      return {
        event: mouseEvent({
          sequence: sgr[0],
          encoding: 'sgr',
          rawCode,
          column,
          row,
          released: final === 'm'
        }),
        length: sgr[0].length
      };
    }
  }
  if (value.startsWith('\u001B[M') && value.length >= 6) {
    const sequence = value.slice(0, 6);
    const rawCode = sequence.codePointAt(3);
    const columnCode = sequence.codePointAt(4);
    const rowCode = sequence.codePointAt(5);
    if (rawCode !== undefined && columnCode !== undefined && rowCode !== undefined) {
      return {
        event: mouseEvent({
          sequence,
          encoding: 'x10',
          rawCode: rawCode - 32,
          column: columnCode - 32,
          row: rowCode - 32,
          released: rawCode - 32 === 3
        }),
        length: sequence.length
      };
    }
  }
  return undefined;
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
    button,
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
