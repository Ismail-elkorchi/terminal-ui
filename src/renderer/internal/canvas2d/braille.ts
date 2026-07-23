import type { CanvasPoint } from './paths.ts';

const BRAILLE_BASE = 0x2800;

const BRAILLE_BITS: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0x01, 0x08]),
  Object.freeze([0x02, 0x10]),
  Object.freeze([0x04, 0x20]),
  Object.freeze([0x40, 0x80])
]);

export interface BrailleCellPoint {
  readonly cell: CanvasPoint;
  readonly mask: number;
}

export function brailleCellForPoint(x: number, y: number): BrailleCellPoint {
  assertInteger(x, 'Braille x coordinate');
  assertInteger(y, 'Braille y coordinate');
  const px = Math.floor(x);
  const py = Math.floor(y);
  const cellX = Math.floor(px / 2);
  const cellY = Math.floor(py / 4);
  const mask = brailleMaskForSubcell(modulo(px, 2), modulo(py, 4));
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

export function brailleMaskForSubcell(x: number, y: number): number {
  assertInteger(x, 'Braille subcell x coordinate');
  assertInteger(y, 'Braille subcell y coordinate');
  if (x < 0 || x > 1 || y < 0 || y > 3) {
    throw new RangeError('Braille subcell coordinates must be within a two-by-four cell.');
  }
  const row = BRAILLE_BITS[y];
  const mask = row?.[x];
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
