import type { Rect } from '../contracts.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { FrameSnapshotMetadata } from './frame-snapshot.ts';
import {
  sameTerminalSnapshotRow,
  snapshotRow,
} from './frame-snapshot.ts';

interface DirtyRegionSource {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly underlay: string;
  readonly backdropBounds?: Rect;
  readonly metadata: FrameSnapshotMetadata;
}

export interface DirtyRegionSet {
  readonly rects: readonly Rect[];
  add(rect: Rect): DirtyRegionSet;
  union(other: DirtyRegionSet): DirtyRegionSet;
  intersect(bounds: Rect): DirtyRegionSet;
}

export function createDirtyRegionSet(rects: readonly Rect[] = []): DirtyRegionSet {
  return dirtyRegionSetFromRects(rects);
}

/** Collects damage without sorting or freezing it until publication. */
export class DirtyRegionBuilder {
  private readonly rects: Rect[] = [];

  add(rect: Rect): void {
    this.rects.push(rect);
  }

  addSet(set: DirtyRegionSet): void {
    this.rects.push(...set.rects);
  }

  build(): DirtyRegionSet {
    return createDirtyRegionSet(this.rects);
  }
}

export function dirtyRegionsForRegionChanges(
  previous: readonly DirtyRegionSource[] | undefined,
  next: readonly DirtyRegionSource[]
): DirtyRegionSet | undefined {
  if (previous === undefined) return undefined;
  const dirty = new DirtyRegionBuilder();
  const previousById = new Map(previous.map((region) => [region.id, region]));
  const nextById = new Map(next.map((region) => [region.id, region]));

  for (const previousRegion of previous) {
    const nextRegion = nextById.get(previousRegion.id);
    if (nextRegion === undefined) {
      dirty.add(effectiveRegionBounds(previousRegion));
      continue;
    }
    dirty.addSet(dirtyRegionsForChangedRegion(previousRegion, nextRegion));
  }
  for (const nextRegion of next) {
    const previousRegion = previousById.get(nextRegion.id);
    if (previousRegion === undefined) {
      dirty.add(effectiveRegionBounds(nextRegion));
    }
  }

  return dirty.build();
}

function dirtyRegionsForChangedRegion(previous: DirtyRegionSource, next: DirtyRegionSource): DirtyRegionSet {
  if (!sameRegionSurface(previous, next)) {
    return createDirtyRegionSet([effectiveRegionBounds(previous), effectiveRegionBounds(next)]);
  }
  if (
    previous.metadata.terminalFingerprint === next.metadata.terminalFingerprint
    && sameTerminalContents(previous.metadata, next.metadata)
  ) return createDirtyRegionSet();

  const changedRows = changedRowRects(previous, next);
  const coverageBuilder = new DirtyRegionBuilder();
  coverageBuilder.addSet(previous.metadata.writtenBounds);
  coverageBuilder.addSet(previous.metadata.clearedBounds);
  coverageBuilder.addSet(next.metadata.writtenBounds);
  coverageBuilder.addSet(next.metadata.clearedBounds);
  const coverage = coverageBuilder.build();
  const coverageNarrowed = intersectDirtyRegionSets(changedRows, coverage);
  return coverageNarrowed.rects.length > 0 ? coverageNarrowed : changedRows;
}

function dirtyRegionSetFromRects(input: readonly Rect[]): DirtyRegionSet {
  const rects = normalizeRects(input);
  return Object.freeze(Object.defineProperties({ rects }, {
    add: {
      enumerable: false,
      value(rect: Rect): DirtyRegionSet {
        return dirtyRegionSetFromRects([...rects, rect]);
      }
    },
    union: {
      enumerable: false,
      value(other: DirtyRegionSet): DirtyRegionSet {
        return dirtyRegionSetFromRects([...rects, ...other.rects]);
      }
    },
    intersect: {
      enumerable: false,
      value(bounds: Rect): DirtyRegionSet {
        return dirtyRegionSetFromRects(rects.flatMap((rect) => {
          const next = intersectRects(rect, bounds);
          return next === undefined ? [] : [next];
        }));
      }
    }
  }) as DirtyRegionSet);
}

function normalizeRects(input: readonly Rect[]): readonly Rect[] {
  const rects = input
    .map(normalizeRect)
    .filter((rect): rect is Rect => rect !== undefined)
    .toSorted((left, right) => left.row - right.row || left.column - right.column || left.width - right.width || left.height - right.height);
  const merged: Rect[] = [];
  for (const rect of rects) {
    const previous = merged.at(-1);
    if (previous?.row === rect.row && previous.height === rect.height && previous.column + previous.width >= rect.column) {
      merged[merged.length - 1] = {
        row: previous.row,
        column: previous.column,
        width: Math.max(previous.column + previous.width, rect.column + rect.width) - previous.column,
        height: previous.height
      };
      continue;
    }
    merged.push(rect);
  }
  return Object.freeze(merged.map((rect) => Object.freeze(rect)));
}

function normalizeRect(rect: Rect): Rect | undefined {
  const row = Math.floor(rect.row);
  const column = Math.floor(rect.column);
  const width = Math.max(0, Math.floor(rect.width));
  const height = Math.max(0, Math.floor(rect.height));
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}

function sameRegionSurface(left: DirtyRegionSource, right: DirtyRegionSource): boolean {
  return left.zIndex === right.zIndex
    && left.order === right.order
    && left.underlay === right.underlay
    && sameOptionalRect(left.backdropBounds, right.backdropBounds)
    && sameRect(left.bounds, right.bounds);
}

function effectiveRegionBounds(region: DirtyRegionSource): Rect {
  return region.backdropBounds ?? region.bounds;
}

function sameOptionalRect(left: Rect | undefined, right: Rect | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return sameRect(left, right);
}

function changedRowRects(previous: DirtyRegionSource, next: DirtyRegionSource): DirtyRegionSet {
  const previousRows = new Map(previous.metadata.rowFingerprints.map((row) => [row.row, row.terminalFingerprint]));
  const nextRows = new Map(next.metadata.rowFingerprints.map((row) => [row.row, row.terminalFingerprint]));
  const rects: Rect[] = [];
  const firstRow = Math.min(previous.bounds.row, next.bounds.row);
  const lastRow = Math.max(
    previous.bounds.row + previous.bounds.height - 1,
    next.bounds.row + next.bounds.height - 1,
  );
  for (let row = firstRow; row <= lastRow; row += 1) {
    const fingerprintsEqual = previousRows.get(row) === nextRows.get(row);
    if (fingerprintsEqual && sameTerminalSnapshotRow(
      snapshotRow(previous.metadata, row),
      snapshotRow(next.metadata, row),
    )) continue;
    rects.push({
      row,
      column: previous.bounds.column,
      width: previous.bounds.width,
      height: 1
    });
  }
  return createDirtyRegionSet(rects);
}

function sameTerminalContents(
  previous: FrameSnapshotMetadata,
  next: FrameSnapshotMetadata,
): boolean {
  const rows = new Set([
    ...previous.rowIndexes.map((entry) => entry.row),
    ...next.rowIndexes.map((entry) => entry.row),
  ]);
  for (const row of rows) {
    if (!sameTerminalSnapshotRow(snapshotRow(previous, row), snapshotRow(next, row))) return false;
  }
  return true;
}

export function intersectDirtyRegionSets(left: DirtyRegionSet, right: DirtyRegionSet): DirtyRegionSet {
  const rows = new Map<number, { start: number; end: number }[]>();
  for (const rect of left.rects) {
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      const intervals = rows.get(row) ?? [];
      intervals.push({ start: rect.column, end: rect.column + rect.width });
      rows.set(row, intervals);
    }
  }
  for (const intervals of rows.values()) {
    intervals.sort((a, b) => a.start - b.start);
    let write = 0;
    for (const interval of intervals) {
      const previous = intervals[write - 1];
      if (previous !== undefined && interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        intervals[write] = interval;
        write += 1;
      }
    }
    intervals.length = write;
  }
  const output = new DirtyRegionBuilder();
  for (const rect of right.rects) {
    const end = rect.column + rect.width;
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      const intervals = rows.get(row);
      if (intervals === undefined) continue;
      let low = 0;
      let high = intervals.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if ((intervals[middle]?.end ?? 0) <= rect.column) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < intervals.length; index += 1) {
        const interval = intervals[index];
        if (interval === undefined || interval.start >= end) break;
        output.add({
          row,
          column: Math.max(rect.column, interval.start),
          width: Math.min(end, interval.end) - Math.max(rect.column, interval.start),
          height: 1,
        });
      }
    }
  }
  return output.build();
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}
