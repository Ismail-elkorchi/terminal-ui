import type { Rect } from '../contracts.ts';
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

export function dirtyRegionsForRegionChanges(
  previous: readonly DirtyRegionSource[] | undefined,
  next: readonly DirtyRegionSource[]
): DirtyRegionSet | undefined {
  if (previous === undefined) return undefined;
  let dirty = createDirtyRegionSet();
  const previousById = new Map(previous.map((region) => [region.id, region]));
  const nextById = new Map(next.map((region) => [region.id, region]));

  for (const previousRegion of previous) {
    const nextRegion = nextById.get(previousRegion.id);
    if (nextRegion === undefined) {
      dirty = dirty.add(effectiveRegionBounds(previousRegion));
      continue;
    }
    dirty = dirty.union(dirtyRegionsForChangedRegion(previousRegion, nextRegion));
  }
  for (const nextRegion of next) {
    const previousRegion = previousById.get(nextRegion.id);
    if (previousRegion === undefined) {
      dirty = dirty.add(effectiveRegionBounds(nextRegion));
    }
  }

  return dirty.rects.length === 0 ? createDirtyRegionSet() : dirty;
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
  const coverage = previous.metadata.writtenBounds
    .union(previous.metadata.clearedBounds)
    .union(next.metadata.writtenBounds)
    .union(next.metadata.clearedBounds);
  const coverageNarrowed = intersectRegionSets(changedRows, coverage);
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

function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const rightEdge = Math.min(left.column + left.width, right.column + right.width);
  const width = Math.max(0, rightEdge - column);
  const height = Math.max(0, bottom - row);
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

function intersectRegionSets(left: DirtyRegionSet, right: DirtyRegionSet): DirtyRegionSet {
  let output = createDirtyRegionSet();
  for (const rect of right.rects) output = output.union(left.intersect(rect));
  return output;
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}
