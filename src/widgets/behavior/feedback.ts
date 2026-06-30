export type ProgressStatus = 'empty' | 'partial' | 'complete' | 'overflow';

export interface ProgressFrameCell {
  readonly index: number;
  readonly active: boolean;
}

export interface ProgressFrame {
  readonly width: number;
  readonly frame: number;
  readonly activeStart: number;
  readonly activeWidth: number;
  readonly cells: readonly ProgressFrameCell[];
}

export function progressStatus(value: number, max: number): ProgressStatus {
  const normalizedMax = normalizePositiveInteger(max, 100);
  const normalizedValue = normalizeFiniteNumber(value, 0);
  if (normalizedValue <= 0) return 'empty';
  if (normalizedValue > normalizedMax) return 'overflow';
  return normalizedValue === normalizedMax ? 'complete' : 'partial';
}

export function indeterminateProgressFrame(frame: number, width: number): ProgressFrame {
  const normalizedWidth = normalizePositiveInteger(width, 1);
  const normalizedFrame = normalizeFrame(frame, normalizedWidth);
  const activeWidth = Math.max(1, Math.min(normalizedWidth, Math.ceil(normalizedWidth / 3)));
  return {
    width: normalizedWidth,
    frame: normalizedFrame,
    activeStart: normalizedFrame,
    activeWidth,
    cells: Array.from({ length: normalizedWidth }, (_unused, index) => ({
      index,
      active: wrappedDistance(index, normalizedFrame, normalizedWidth) < activeWidth
    }))
  };
}

function normalizePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeFrame(frame: number, width: number): number {
  const index = Number.isFinite(frame) ? Math.floor(frame) : 0;
  return ((index % width) + width) % width;
}

function wrappedDistance(index: number, start: number, width: number): number {
  return (index - start + width) % width;
}
