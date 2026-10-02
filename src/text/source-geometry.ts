import { finishWork } from '../foundation/cooperative-work.ts';
import { measureGraphemeCells } from './graphemes.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { clampTextOffset, normalizeSourceCursor } from './text-range.ts';
import type { TextMeasurementOptions, TextWidthProfile } from './types.ts';
import { defineTextWidthProfile, textWidthProfileKey } from './width-profile.ts';

const pageLength = 1_024;

/** Geometry is width-dependent; its source boundaries remain revision-owned. */
export function sourceGeometry(source: SourceBoundaryIndex, options: TextMeasurementOptions = {}): SourceGeometry {
  const key = `geometry:${textWidthProfileKey(options.widthProfile)}`;
  const cached = source.derivedData(key) as SourceGeometry | undefined;
  if (cached !== undefined) return cached;
  const geometry = new SourceGeometry(source, defineTextWidthProfile(options.widthProfile));
  source.retainDerivedData(key, geometry);
  return geometry;
}

/** Numeric prefix geometry, without a parallel array of measured grapheme objects. */
export class SourceGeometry {
  private readonly source: SourceBoundaryIndex;
  private readonly profile: TextWidthProfile;
  private readonly columns: number[][];
  private count: number;

  constructor(source: SourceBoundaryIndex, profile: TextWidthProfile, previous?: SourceGeometry) {
    this.source = source;
    this.profile = profile;
    this.count = Math.min(source.inheritedBoundaryCount, previous?.count ?? 1);
    const fullPages = Math.floor(this.count / pageLength);
    this.columns = previous?.columns.slice(0, fullPages) ?? [];
    const remainder = this.count % pageLength;
    if (remainder !== 0) this.columns.push(previous?.columns[fullPages]?.slice(0, remainder) ?? [0]);
  }

  get reservedBytes(): number { return this.source.source.length * 10 + 128; }

  forRevision(source: SourceBoundaryIndex): SourceGeometry {
    return new SourceGeometry(source, this.profile, this);
  }

  *prepareOffsetWork(offset: number): Generator<void, void> {
    const bounded = clampTextOffset(offset, this.source.source.length);
    yield* this.extendWork(() => this.lastOffset() < bounded);
  }

  *prepareColumnWork(column: number): Generator<void, void> {
    const bounded = Number.isFinite(column) ? Math.max(0, Math.floor(column)) : 0;
    // Include zero-width clusters at an exact column, matching terminal indexes.
    yield* this.extendWork(() => this.lastColumn() <= bounded);
  }

  columnAt(offset: number): number {
    finishWork(this.prepareOffsetWork(offset));
    const cursor = normalizeSourceCursor(this.source, offset);
    return this.column(Math.min(this.count - 1, this.source.indexAtOffset(cursor)));
  }

  offsetAt(column: number): number {
    const bounded = Number.isFinite(column) ? Math.max(0, Math.floor(column)) : 0;
    finishWork(this.prepareColumnWork(bounded));
    let lower = 0;
    let upper = this.count;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (this.column(middle) <= bounded) lower = middle + 1;
      else upper = middle;
    }
    return this.source.offsetAtIndex(Math.max(0, lower - 1));
  }

  private *extendWork(needed: () => boolean): Generator<void, void> {
    let operations = 0;
    while (needed() && this.lastOffset() < this.source.source.length) {
      const start = this.lastOffset();
      yield* this.source.prepareThroughWork(start);
      // Another preparer may have advanced this shared owner while we yielded.
      if (this.lastOffset() !== start) continue;
      const end = this.source.at(start)?.endOffsetExclusive ?? this.source.source.length;
      const cells = measureGraphemeCells(this.source.source.slice(start, end), { widthProfile: this.profile });
      const column = this.lastColumn() + cells;
      (this.columns[Math.floor(this.count / pageLength)] ??= []).push(column);
      this.count += 1;
      if (++operations % 256 === 0) yield;
    }
  }

  private lastOffset(): number { return this.source.offsetAtIndex(this.count - 1); }
  private lastColumn(): number { return this.column(this.count - 1); }
  private column(index: number): number { return this.columns[Math.floor(index / pageLength)]?.[index % pageLength] ?? 0; }
}
