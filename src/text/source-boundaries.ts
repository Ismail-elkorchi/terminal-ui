import { finishWork } from '../foundation/cooperative-work.ts';
import type { TextEditBuffer } from './types.ts';

/** Unicode source boundaries, deliberately independent of terminal cell widths. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const pageLength = 1_024;
const nativeWindowLength = 4_096;
const cacheLimit = 33_554_432;
const cache = new Map<string, SourceBoundaryIndex>();
let cacheBytes = 0;
const cacheWeights = new WeakMap<SourceBoundaryIndex, number>();
const sourceOwners = new WeakMap<object, SourceBoundaryIndex>();

export interface BoundarySource {
  readonly length: number;
  slice(start: number, end?: number): string;
}

export interface SourceRevisionData {
  readonly reservedBytes: number;
  forRevision(source: SourceBoundaryIndex): SourceRevisionData;
}

/** Owned by a buffer or document line. Complete pages are shared by revisions;
 * the unfinished page and native iterator belong only to this revision. */
export class SourceBoundaryIndex {
  readonly source: BoundarySource;
  readonly inheritedBoundaryCount: number;
  readonly unchangedFromPrevious: boolean;
  private readonly revisionData = new Map<string, SourceRevisionData>();
  private readonly pages: number[][];
  private count: number;
  private iterator: Iterator<Intl.SegmentData> | undefined;
  private iteratorStart: number;
  private iteratorEnd = 0;
  private windowLength = nativeWindowLength;

  constructor(source: BoundarySource, previous?: SourceBoundaryIndex, changedAt = 0) {
    this.source = source;
    // A cluster can grow across the edit seam. Restart at the beginning of the
    // entire preceding cluster, not a fixed number of code units. A grapheme
    // boundary resets segmentation context, including the parity of RI pairs.
    const before = previous === undefined || changedAt === 0 ? 0
      : previous.find(Math.min(changedAt - 1, previous.last()));
    this.count = before + 1;
    this.inheritedBoundaryCount = this.count;
    this.unchangedFromPrevious = previous !== undefined && changedAt > source.length
      && previous.source.length === source.length;
    const fullPages = Math.floor(this.count / pageLength);
    this.pages = previous?.pages.slice(0, fullPages) ?? [];
    const remainder = this.count % pageLength;
    if (remainder !== 0) this.pages.push(previous?.pages[fullPages]?.slice(0, remainder) ?? [0]);
    this.iteratorStart = this.last();
    // Derived numeric prefixes fork immediately, so skipped render revisions or
    // collection of the old document cannot discard reusable preparation.
    for (const [key, data] of previous?.revisionData ?? []) this.revisionData.set(key, data.forRevision(this));
  }

  /** A row borrows already prepared grapheme boundaries; never resegment a
   * wrapped substring whose Unicode context belongs to the complete line. */
  slice(start: number, end: number): SourceBoundaryIndex {
    if (start === 0 && end === this.source.length) return this;
    const first = this.indexAtOffset(start);
    const last = this.indexAtOffset(end);
    if (this.offsetAtIndex(first) !== start || this.offsetAtIndex(last) !== end) {
      throw new RangeError('Source boundary slices must align to grapheme boundaries.');
    }
    const sliced = new SourceBoundaryIndex(this.source.slice(start, end));
    sliced.pages.length = 0;
    sliced.count = last - first + 1;
    for (let index = 0; index < sliced.count; index += 1) {
      const page = Math.floor(index / pageLength);
      (sliced.pages[page] ??= []).push(this.offset(first + index) - start);
    }
    sliced.iteratorStart = end - start;
    return sliced;
  }

  derivedData(key: string): SourceRevisionData | undefined { return this.revisionData.get(key); }
  retainDerivedData(key: string, value: SourceRevisionData): void {
    this.revisionData.set(key, value);
    reserveSourcePreparation(this, value.reservedBytes);
  }
  derivedReservation(): number {
    let bytes = 0;
    for (const value of this.revisionData.values()) bytes += value.reservedBytes;
    return bytes;
  }

  at(offset: number): { readonly startOffset: number; readonly endOffsetExclusive: number } | undefined {
    if (!Number.isFinite(offset) || offset < 0 || offset >= this.source.length) return undefined;
    finishWork(this.prepareThroughWork(offset));
    const index = this.find(offset);
    return { startOffset: this.offset(index), endOffsetExclusive: this.offset(index + 1) };
  }

  *segments(text?: string): IterableIterator<{ readonly segment: string; readonly index: number }> {
    for (const event of this.segmentEvents(text)) if (typeof event !== 'number') yield event;
  }

  /** Numeric events carry preparation charges; objects carry the next owned span. */
  *segmentEvents(text?: string): Generator<number | { readonly segment: string; readonly index: number }, void> {
    for (let index = 0; this.offset(index) < this.source.length; index += 1) {
      const start = this.offset(index);
      yield* this.prepareThroughWork(start);
      yield { segment: (text ?? this.source).slice(start, this.offset(index + 1)), index: start };
    }
  }

  /** Numeric indexed access avoids flattened copies in geometry consumers. */
  indexAtOffset(offset: number): number {
    const bounded = Number.isFinite(offset) ? Math.max(0, Math.min(this.source.length, Math.floor(offset))) : 0;
    finishWork(this.prepareThroughWork(bounded));
    return this.find(bounded);
  }

  offsetAtIndex(index: number): number {
    const bounded = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    while (this.count <= bounded && this.last() < this.source.length) {
      finishWork(this.prepareThroughWork(this.last()));
    }
    return this.offset(Math.min(bounded, this.count - 1));
  }

  offsets(): readonly number[] {
    finishWork(this.prepareThroughWork(this.source.length));
    return Object.freeze(this.pages.flat());
  }

  /** Resumable source work shared by synchronous queries and effect preparation. */
  *prepareThroughWork(offset: number): Generator<number, void> {
    let operations = 0;
    while (this.last() <= offset && this.last() < this.source.length) {
      if (this.iterator === undefined) {
        this.iteratorEnd = Math.min(this.source.length, this.iteratorStart + this.windowLength);
        if (this.iteratorEnd < this.source.length) {
          const seam = this.source.slice(this.iteratorEnd - 1, this.iteratorEnd + 1);
          if (isHighSurrogate(seam.charCodeAt(0)) && isLowSurrogate(seam.charCodeAt(1))) this.iteratorEnd += 1;
        }
        this.iterator = segmenter.segment(this.source.slice(this.iteratorStart, this.iteratorEnd))[Symbol.iterator]();
        yield this.iteratorEnd - this.iteratorStart;
        continue;
      }
      const next = this.iterator.next();
      if (next.done === true) break;
      const end = this.iteratorStart + next.value.index + next.value.segment.length;
      if (end === this.iteratorEnd && end < this.source.length) {
        // Only the artificial final break is uncertain. Restart at the beginning
        // of the ENTIRE trailing cluster. This preserves GB9c/GB11 context and RI
        // parity (discarded complete RI clusters contain pairs). Never use fixed
        // lookbehind. See the runtime differential grapheme-window test.
        this.windowLength = this.last() > this.iteratorStart ? nativeWindowLength : this.windowLength * 2;
        this.iteratorStart = this.last();
        this.iterator = undefined;
        // A giant cluster can require an arbitrarily large native callback. Its
        // geometric growth is resumable, but that individual callback is not.
        yield operations + next.value.segment.length;
        operations = 0;
        continue;
      }
      const page = Math.floor(this.count / pageLength);
      (this.pages[page] ??= []).push(end);
      this.count += 1;
      if (end === this.source.length) this.iterator = undefined;
      operations += next.value.segment.length + 1;
      if (operations >= 256) { yield operations; operations = 0; }
    }
    if (operations !== 0) yield operations;
    if (this.last() === this.source.length) this.iterator = undefined;
  }

  private last(): number { return this.offset(this.count - 1); }

  private offset(index: number): number {
    return this.pages[Math.floor(index / pageLength)]?.[index % pageLength] ?? 0;
  }

  private find(offset: number): number {
    let lower = 0;
    let upper = this.count;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (this.offset(middle) <= offset) lower = middle + 1;
      else upper = middle;
    }
    return Math.max(0, lower - 1);
  }
}

export function cachedSourceBoundaries(text: string): SourceBoundaryIndex | undefined {
  // Do not hash a new oversized rope string merely to miss a cache that cannot
  // admit it. Hashing can itself flatten the whole buffer after a local edit.
  if (boundaryWeight(text) > cacheLimit / 2) return undefined;
  const cached = cache.get(text);
  if (cached !== undefined) {
    cache.delete(text);
    cache.set(text, cached);
  }
  return cached;
}

export function sourceBoundaries(text: string): SourceBoundaryIndex {
  return cachedSourceBoundaries(text) ?? retainSourceBoundaries(text, new SourceBoundaryIndex(text));
}

export function editSourceBoundaries(text: string, previous: SourceBoundaryIndex, changedAt: number): SourceBoundaryIndex {
  return cachedSourceBoundaries(text) ?? retainSourceBoundaries(text, new SourceBoundaryIndex(text, previous, changedAt));
}

function retainSourceBoundaries(text: string, boundaries: SourceBoundaryIndex): SourceBoundaryIndex {
  // Reserve source and worst-case numeric offsets before global retention.
  // Larger sources are still indexed, but only their buffer/document owns them.
  const weight = boundaryWeight(text) + boundaries.derivedReservation();
  if (weight > cacheLimit / 2) return boundaries;
  cache.set(text, boundaries);
  cacheWeights.set(boundaries, weight);
  cacheBytes += weight;
  while (cacheBytes > cacheLimit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const entry = cache.get(oldest);
    cache.delete(oldest);
    cacheBytes -= entry === undefined ? boundaryWeight(oldest) : cacheWeights.get(entry) ?? boundaryWeight(oldest);
  }
  return boundaries;
}

/** Charge derived state to the global stateless budget too. Live revision owners
 * keep their state when this conservative reservation evicts a global entry. */
export function reserveSourcePreparation(source: SourceBoundaryIndex, bytes: number): void {
  const text = source.source;
  if (typeof text !== 'string' || cache.get(text) !== source) return;
  const previous = cacheWeights.get(source) ?? boundaryWeight(text);
  const weight = previous + bytes;
  cacheWeights.set(source, weight);
  cacheBytes += bytes;
  if (weight > cacheLimit / 2) {
    cache.delete(text);
    cacheBytes -= weight;
  }
  while (cacheBytes > cacheLimit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const entry = cache.get(oldest);
    cache.delete(oldest);
    cacheBytes -= entry === undefined ? boundaryWeight(oldest) : cacheWeights.get(entry) ?? boundaryWeight(oldest);
  }
}

function boundaryWeight(text: string): number { return 128 + text.length * 18; }

export function bufferSourceBoundaries(buffer: TextEditBuffer): SourceBoundaryIndex {
  return sourceBoundariesForOwner(buffer, buffer.text);
}

/** Retain canonical boundaries with a revision owner when global text caches evict. */
export function sourceBoundariesForOwner(owner: object, text: string): SourceBoundaryIndex {
  const index = sourceOwners.get(owner);
  // JavaScript callers may mutate buffers/models; never reuse changed source.
  if (index?.source === text) return index;
  const next = sourceBoundaries(text);
  sourceOwners.set(owner, next);
  return next;
}

export function retainBufferBoundaries(buffer: TextEditBuffer, source: SourceBoundaryIndex): TextEditBuffer {
  sourceOwners.set(buffer, source);
  return buffer;
}

function isHighSurrogate(value: number): boolean { return value >= 0xd800 && value <= 0xdbff; }
function isLowSurrogate(value: number): boolean { return value >= 0xdc00 && value <= 0xdfff; }
