import type { TextEditBuffer } from './types.ts';

/** Unicode source boundaries, deliberately independent of terminal cell widths. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const pageLength = 1_024;
const cacheLimit = 33_554_432;
const cache = new Map<string, SourceBoundaryIndex>();
let cacheBytes = 0;
const bufferIndexes = new WeakMap<TextEditBuffer, SourceBoundaryIndex>();

export interface BoundarySource {
  readonly length: number;
  slice(start: number, end?: number): string;
}

/** Owned by a buffer or document line. Complete pages are shared by revisions;
 * the unfinished page and native iterator belong only to this revision. */
export class SourceBoundaryIndex {
  readonly source: BoundarySource;
  private readonly pages: number[][];
  private count: number;
  private iterator: Iterator<Intl.SegmentData> | undefined;
  private iteratorStart: number;

  constructor(source: BoundarySource, previous?: SourceBoundaryIndex, changedAt = 0) {
    this.source = source;
    // A cluster can grow across the edit seam. Restart at the beginning of the
    // entire preceding cluster, not a fixed number of code units. A grapheme
    // boundary resets segmentation context, including the parity of RI pairs.
    const before = previous === undefined || changedAt === 0 ? 0
      : previous.find(Math.min(changedAt - 1, previous.last()));
    this.count = before + 1;
    const fullPages = Math.floor(this.count / pageLength);
    this.pages = previous?.pages.slice(0, fullPages) ?? [];
    const remainder = this.count % pageLength;
    if (remainder !== 0) this.pages.push(previous?.pages[fullPages]?.slice(0, remainder) ?? [0]);
    this.iteratorStart = this.last();
  }

  at(offset: number): { readonly startOffset: number; readonly endOffsetExclusive: number } | undefined {
    if (!Number.isFinite(offset) || offset < 0 || offset >= this.source.length) return undefined;
    this.extend(offset);
    const index = this.find(offset);
    return { startOffset: this.offset(index), endOffsetExclusive: this.offset(index + 1) };
  }

  *segments(text?: string): IterableIterator<{ readonly segment: string; readonly index: number }> {
    for (let index = 0; this.offset(index) < this.source.length; index += 1) {
      const start = this.offset(index);
      this.extend(start);
      yield { segment: (text ?? this.source).slice(start, this.offset(index + 1)), index: start };
    }
  }

  offsets(): readonly number[] {
    this.extend(this.source.length);
    return Object.freeze(this.pages.flat());
  }

  private extend(offset: number): void {
    while (this.last() <= offset && this.last() < this.source.length) {
      this.iterator ??= segmenter.segment(this.source.slice(this.iteratorStart))[Symbol.iterator]();
      const next = this.iterator.next();
      if (next.done === true) break;
      const end = this.iteratorStart + next.value.index + next.value.segment.length;
      const page = Math.floor(this.count / pageLength);
      (this.pages[page] ??= []).push(end);
      this.count += 1;
    }
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
  const weight = boundaryWeight(text);
  if (weight > cacheLimit / 2) return boundaries;
  cache.set(text, boundaries);
  cacheBytes += weight;
  while (cacheBytes > cacheLimit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
    cacheBytes -= boundaryWeight(oldest);
  }
  return boundaries;
}

function boundaryWeight(text: string): number { return 128 + text.length * 18; }

export function bufferSourceBoundaries(buffer: TextEditBuffer): SourceBoundaryIndex {
  const index = bufferIndexes.get(buffer);
  // Public buffers may be mutable JavaScript objects. Never reuse an index for
  // text the caller replaced outside the editing functions.
  if (index?.source === buffer.text) return index;
  const next = sourceBoundaries(buffer.text);
  bufferIndexes.set(buffer, next);
  return next;
}

export function retainBufferBoundaries(buffer: TextEditBuffer, source: SourceBoundaryIndex): TextEditBuffer {
  bufferIndexes.set(buffer, source);
  return buffer;
}
