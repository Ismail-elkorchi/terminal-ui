import { createDirtyRegionSet } from './dirty-regions.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { Rect } from './layout.ts';

interface ColumnInterval {
  readonly start: number;
  readonly end: number;
}

export class DirtyCoverageAccumulator {
  private readonly intervalsByRow = new Map<number, ColumnInterval[]>();

  add(rect: Rect): void {
    const normalized = normalizeRect(rect);
    if (normalized === undefined) return;
    const endRow = normalized.row + normalized.height;
    const endColumn = normalized.column + normalized.width;
    for (let row = normalized.row; row < endRow; row += 1) {
      const intervals = this.intervalsByRow.get(row);
      const interval = { start: normalized.column, end: endColumn };
      if (intervals === undefined) {
        this.intervalsByRow.set(row, [interval]);
      } else {
        intervals.push(interval);
      }
    }
  }

  toDirtyRegionSet(): DirtyRegionSet {
    return createDirtyRegionSet(this.toRects());
  }

  private toRects(): readonly Rect[] {
    const rects: Rect[] = [];
    const rows = [...this.intervalsByRow.keys()].sort((left, right) => left - right);
    for (const row of rows) {
      const intervals = mergedIntervals(this.intervalsByRow.get(row) ?? []);
      for (const interval of intervals) {
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

function mergedIntervals(intervals: readonly ColumnInterval[]): readonly ColumnInterval[] {
  const sorted = intervals.toSorted((left, right) => left.start - right.start || left.end - right.end);
  const output: ColumnInterval[] = [];
  for (const interval of sorted) {
    const previous = output.at(-1);
    if (previous?.end !== undefined && previous.end >= interval.start) {
      output[output.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, interval.end)
      };
      continue;
    }
    output.push(interval);
  }
  return output;
}

function normalizeRect(rect: Rect): Rect | undefined {
  const row = Math.floor(rect.row);
  const column = Math.floor(rect.column);
  const width = Math.max(0, Math.floor(rect.width));
  const height = Math.max(0, Math.floor(rect.height));
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}
