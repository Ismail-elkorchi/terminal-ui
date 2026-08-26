import type { CanvasPoint } from './paths.ts';

const BRAILLE_BASE = 0x2800;

const BRAILLE_BITS: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0x01, 0x08]),
  Object.freeze([0x02, 0x10]),
  Object.freeze([0x04, 0x20]),
  Object.freeze([0x40, 0x80])
]);

export interface BrailleCellMapping {
  readonly cell: CanvasPoint;
  readonly mask: number;
}

export function brailleCellForSubcell(
  columnSubcell: number,
  rowSubcell: number
): BrailleCellMapping {
  assertInteger(columnSubcell, 'Braille column subcell coordinate');
  assertInteger(rowSubcell, 'Braille row subcell coordinate');
  const column = Math.floor(columnSubcell);
  const row = Math.floor(rowSubcell);
  const cellX = Math.floor(column / 2);
  const cellY = Math.floor(row / 4);
  const mask = brailleMaskForSubcell(modulo(column, 2), modulo(row, 4));
  return {
    cell: { x: cellX, y: cellY },
    mask
  };
}

export function brailleCharacter(mask: number): string {
  if (!Number.isInteger(mask) || mask < 0 || mask > 0xff) {
    throw new RangeError('Braille mask must be an integer from 0 through 255.');
  }
  return String.fromCodePoint(BRAILLE_BASE + mask);
}

export function brailleMaskForSubcell(columnSubcell: number, rowSubcell: number): number {
  assertInteger(columnSubcell, 'Braille column subcell coordinate');
  assertInteger(rowSubcell, 'Braille row subcell coordinate');
  if (columnSubcell < 0 || columnSubcell > 1 || rowSubcell < 0 || rowSubcell > 3) {
    throw new RangeError('Braille subcell coordinates must be within a two-by-four cell.');
  }
  const row = BRAILLE_BITS[rowSubcell];
  const mask = row?.[columnSubcell];
  if (mask === undefined) return 0;
  return mask;
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function assertInteger(value: number, name: string): void {
  if (Number.isInteger(value)) return;
  throw new RangeError(`${name} must be a finite integer.`);
}
