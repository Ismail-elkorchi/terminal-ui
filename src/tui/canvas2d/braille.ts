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
  return String.fromCodePoint(BRAILLE_BASE + normalizeMask(mask));
}

export function brailleMaskForSubcell(x: number, y: number): number {
  const row = BRAILLE_BITS[y];
  const mask = row?.[x];
  if (mask === undefined) return 0;
  return mask;
}

function normalizeMask(mask: number): number {
  return Math.max(0, Math.min(0xff, Math.floor(mask)));
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}
