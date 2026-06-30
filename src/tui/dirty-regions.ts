import type { Rect } from './layout.ts';
import type { RenderRegion } from './render-regions.ts';

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
  previous: readonly RenderRegion[] | undefined,
  next: readonly RenderRegion[]
): DirtyRegionSet | undefined {
  if (previous === undefined) return undefined;
  let dirty = createDirtyRegionSet();
  const previousById = new Map(previous.map((region) => [region.id, region]));
  const nextById = new Map(next.map((region) => [region.id, region]));

  for (const previousRegion of previous) {
    const nextRegion = nextById.get(previousRegion.id);
    if (nextRegion === undefined) {
      dirty = dirty.add(previousRegion.bounds);
      continue;
    }
    dirty = dirty.union(dirtyRegionsForChangedRegion(previousRegion, nextRegion));
  }
  for (const nextRegion of next) {
    const previousRegion = previousById.get(nextRegion.id);
    if (previousRegion === undefined) {
      dirty = dirty.add(nextRegion.bounds);
    }
  }

  return dirty.rects.length === 0 ? createDirtyRegionSet() : dirty;
}

function dirtyRegionsForChangedRegion(previous: RenderRegion, next: RenderRegion): DirtyRegionSet {
  if (!sameRegionSurface(previous, next)) {
    return createDirtyRegionSet([previous.bounds, next.bounds]);
  }
  if (previous.metadata.fingerprint === next.metadata.fingerprint) return createDirtyRegionSet();

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
  return Object.defineProperties({ rects }, {
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
  }) as DirtyRegionSet;
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
  return Object.freeze(merged);
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

function sameRegionSurface(left: RenderRegion, right: RenderRegion): boolean {
  return left.zIndex === right.zIndex
    && left.order === right.order
    && left.opacity === right.opacity
    && sameRect(left.bounds, right.bounds);
}

function changedRowRects(previous: RenderRegion, next: RenderRegion): DirtyRegionSet {
  const previousRows = new Map(previous.metadata.rowFingerprints.map((row) => [row.row, row.fingerprint]));
  const nextRows = new Map(next.metadata.rowFingerprints.map((row) => [row.row, row.fingerprint]));
  const rowCount = Math.max(previous.bounds.height, next.bounds.height);
  const rects: Rect[] = [];
  for (let localRow = 1; localRow <= rowCount; localRow += 1) {
    if (previousRows.get(localRow) === nextRows.get(localRow)) continue;
    rects.push({
      row: previous.bounds.row + localRow - 1,
      column: previous.bounds.column,
      width: previous.bounds.width,
      height: 1
    });
  }
  return createDirtyRegionSet(rects);
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
