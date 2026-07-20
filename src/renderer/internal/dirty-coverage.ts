import { createDirtyRegionSet } from './dirty-regions.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Rect } from '../model/layout.ts';

interface ColumnInterval {
  start: number;
  end: number;
}

export class DirtyCoverageAccumulator {
  private readonly intervalsByRow = new Map<number, ColumnInterval[]>();

  add(rect: Rect): void {
    const normalized = normalizeRect(rect);
    if (normalized === undefined) return;
    for (let row = normalized.row; row < normalized.row + normalized.height; row += 1) {
      this.addSpan(row, normalized.column, normalized.width);
    }
  }

  addSpan(row: number, column: number, width: number): void {
    if (!Number.isInteger(row) || !Number.isInteger(column) || !Number.isInteger(width) || width <= 0) return;
    const start = column;
    const end = column + width;
    const intervals = this.intervalsByRow.get(row);
    if (intervals === undefined) {
      this.intervalsByRow.set(row, [{ start, end }]);
      return;
    }

    const last = intervals.at(-1);
    if (last !== undefined && start >= last.start) {
      if (start <= last.end) last.end = Math.max(last.end, end);
      else intervals.push({ start, end });
      return;
    }

    mergeSpan(intervals, start, end);
  }

  toDirtyRegionSet(): DirtyRegionSet {
    return createDirtyRegionSet(this.toRects());
  }

  private toRects(): readonly Rect[] {
    const rects: Rect[] = [];
    const rows = [...this.intervalsByRow.keys()].sort((left, right) => left - right);
    for (const row of rows) {
      for (const interval of this.intervalsByRow.get(row) ?? []) {
        appendRowInterval(rects, row, interval);
      }
    }
    return rects;
  }
}

function appendRowInterval(rects: Rect[], row: number, interval: ColumnInterval): void {
  const width = interval.end - interval.start;
  const previous = rects.at(-1);
  if (
    previous?.column === interval.start
    && previous.width === width
    && previous.row + previous.height === row
  ) {
    rects[rects.length - 1] = { ...previous, height: previous.height + 1 };
    return;
  }
  rects.push({ row, column: interval.start, width, height: 1 });
}

function mergeSpan(intervals: ColumnInterval[], start: number, end: number): void {
  let first = 0;
  while (first < intervals.length && (intervals[first]?.end ?? 0) < start) first += 1;
  let nextStart = start;
  let nextEnd = end;
  let last = first;
  while (last < intervals.length && (intervals[last]?.start ?? Number.POSITIVE_INFINITY) <= nextEnd) {
    const current = intervals[last];
    if (current !== undefined) {
      nextStart = Math.min(nextStart, current.start);
      nextEnd = Math.max(nextEnd, current.end);
    }
    last += 1;
  }
  intervals.splice(first, last - first, { start: nextStart, end: nextEnd });
}

function normalizeRect(rect: Rect): Rect | undefined {
  const row = Math.floor(rect.row);
  const column = Math.floor(rect.column);
  const width = Math.max(0, Math.floor(rect.width));
  const height = Math.max(0, Math.floor(rect.height));
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}
