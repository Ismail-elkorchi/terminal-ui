export const maximumFrameColumns = 10_000;
export const maximumFrameRows = 10_000;
export const maximumFrameCells = 1_000_000;

export function assertFrameDimensions(width: number, height: number): void {
  requireDimension(width, maximumFrameColumns, 'frame width');
  requireDimension(height, maximumFrameRows, 'frame height');
  if (width * height > maximumFrameCells) {
    throw new RangeError(`Frame size must not exceed ${String(maximumFrameCells)} cells.`);
  }
}

function requireDimension(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  if (value > maximum) {
    throw new RangeError(`${label} must not exceed ${String(maximum)}.`);
  }
}
