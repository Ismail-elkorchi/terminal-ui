import type { Rect } from '../../geometry/types.ts';


export interface DirtyRegionSet {
  readonly rects: readonly Rect[];
  add(rect: Rect): DirtyRegionSet;
  union(other: DirtyRegionSet): DirtyRegionSet;
  intersect(bounds: Rect): DirtyRegionSet;
}
