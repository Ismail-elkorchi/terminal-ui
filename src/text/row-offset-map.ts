import { finishWork } from '../foundation/cooperative-work.ts';
import type { RowOffsetMap } from './types.ts';

export function createRowOffsetMap(
  rowSourceOffsets: readonly number[]
): RowOffsetMap {
  return finishWork(createRowOffsetMapWork(rowSourceOffsets));
}

/** Shared validation and ownership for large cooperative layout observations. */
export function* createRowOffsetMapWork(rowSourceOffsets: readonly number[]): Generator<number, RowOffsetMap> {
  if (!Array.isArray(rowSourceOffsets)) {
    throw new TypeError('Row source offsets must be an array.');
  }
  const source: readonly number[] = rowSourceOffsets;
  const offsets: number[] = [];
  for (let row = 0; row < source.length; row += 1) {
    const offset = source[row];
    if (offset === undefined) throw new RangeError(`Row source offset ${String(row)} must be a non-negative safe integer.`);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError(`Row source offset ${String(row)} must be a non-negative safe integer.`);
    }
    if (row > 0 && offset < (offsets[row - 1] ?? 0)) {
      throw new RangeError('Row source offsets must be monotonically ordered.');
    }
    offsets.push(offset);
    if (offsets.length % 128 === 0) yield 128;
  }
  if (offsets.length % 128 !== 0) yield offsets.length % 128;
  Object.freeze(offsets);
  return Object.freeze({
    rowCount: offsets.length,
    sourceOffsetAtRow(row: number): number {
      if (offsets.length === 0) return 0;
      const index = boundedInteger(row, offsets.length - 1);
      return offsets.at(index) ?? 0;
    },
    rowAtSourceOffset(offset: number): number {
      if (offsets.length === 0) return 0;
      const target = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      let low = 0;
      let high = offsets.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if ((offsets[middle] ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
        else high = middle;
      }
      return Math.max(0, low - 1);
    }
  });
}

function boundedInteger(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}
