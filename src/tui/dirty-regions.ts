import { sameFrameCell } from './render-primitives.ts';
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
    if (nextRegion === undefined || !sameRegion(previousRegion, nextRegion)) {
      dirty = dirty.add(previousRegion.bounds);
    }
  }
  for (const nextRegion of next) {
    const previousRegion = previousById.get(nextRegion.id);
    if (previousRegion === undefined || !sameRegion(previousRegion, nextRegion)) {
      dirty = dirty.add(nextRegion.bounds);
    }
  }

  return dirty.rects.length === 0 ? createDirtyRegionSet() : dirty;
}

function dirtyRegionSetFromRects(input: readonly Rect[]): DirtyRegionSet {
  const rects = normalizeRects(input);
  return {
    rects,
    add(rect) {
      return dirtyRegionSetFromRects([...rects, rect]);
    },
    union(other) {
      return dirtyRegionSetFromRects([...rects, ...other.rects]);
    },
    intersect(bounds) {
      return dirtyRegionSetFromRects(rects.flatMap((rect) => {
        const next = intersectRects(rect, bounds);
        return next === undefined ? [] : [next];
      }));
    }
  };
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

function sameRegion(left: RenderRegion, right: RenderRegion): boolean {
  return left.zIndex === right.zIndex
    && left.order === right.order
    && left.opacity === right.opacity
    && sameRect(left.bounds, right.bounds)
    && sameRegionCells(left, right);
}

function sameRegionCells(left: RenderRegion, right: RenderRegion): boolean {
  if (left.cells.length !== right.cells.length) return false;
  const leftCells = [...left.cells].toSorted(compareCellPosition);
  const rightCells = [...right.cells].toSorted(compareCellPosition);
  return leftCells.every((cell, index) => {
    const other = rightCells[index];
    return cell.row === other?.row
      && cell.column === other.column
      && sameFrameCell(cell, other);
  });
}

function compareCellPosition(left: { readonly row: number; readonly column: number }, right: { readonly row: number; readonly column: number }): number {
  return left.row - right.row || left.column - right.column;
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}
