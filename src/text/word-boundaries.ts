import { finishWork } from '../foundation/cooperative-work.ts';
import { wordSegmenter } from './graphemes.ts';
import { reserveSourcePreparation, sourceBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { sourceGeometry } from './source-geometry.ts';
import { clampTextOffset, normalizeSourceCursor } from './text-range.ts';
import type { TextBoundaryOptions, TextSelection } from './types.ts';

export interface WordBoundaryIndex {
  previous(offset: number): number;
  next(offset: number): number;
  selectionAt(offset: number): TextSelection;
}

const wordCacheLimit = 16_777_216;
const wordIndexes = new Map<string, WordBoundaryIndex>();
let wordCacheBytes = 0;

/** Word state belongs to the source revision, independently of width policy. */
const ownedLineStarts = new WeakMap<SourceBoundaryIndex, readonly number[]>();
interface NativeWordState {
  readonly starts: number[];
  readonly ends: number[];
  iterator: Iterator<Intl.SegmentData> | undefined;
  complete: boolean;
  pending: { readonly start: number; readonly end: number } | undefined;
}

/** Shared only for proven unchanged logical lines. Neither numeric state nor the
 * native iterator references a document accessor or an old source wrapper. */
class SourceWordStates {
  readonly indexes = new Map<string, OwnedWordBoundaryIndex>();
  private readonly source: SourceBoundaryIndex;

  constructor(source: SourceBoundaryIndex, previous?: SourceWordStates) {
    this.source = source;
    if (source.unchangedFromPrevious && previous !== undefined) {
      for (const [locale, index] of previous.indexes) this.indexes.set(locale, index.forSource(source));
    }
  }

  get reservedBytes(): number { return 128 + this.indexes.size * (this.source.source.length * 64 + 128); }
  forRevision(source: SourceBoundaryIndex): SourceWordStates { return new SourceWordStates(source, this); }
}

export function ownedWordBoundaryIndex(source: SourceBoundaryIndex, options: TextBoundaryOptions = {}): OwnedWordBoundaryIndex {
  const locale = wordSegmenter(options.locale).resolvedOptions().locale;
  let words = source.derivedData('words') as SourceWordStates | undefined;
  if (words === undefined) {
    words = new SourceWordStates(source);
    source.retainDerivedData('words', words);
  }
  const byLocale = words.indexes;
  const cached = byLocale.get(locale);
  if (cached !== undefined) {
    byLocale.delete(locale);
    byLocale.set(locale, cached);
    return cached;
  }
  const index = new OwnedWordBoundaryIndex(source, locale);
  byLocale.set(locale, index);
  reserveSourcePreparation(source, source.source.length * 64 + 128);
  while (byLocale.size > 8) {
    const oldest = byLocale.keys().next().value;
    if (oldest === undefined) break;
    byLocale.delete(oldest);
  }
  return index;
}

/** Native locale word segmentation is deliberately not split into assumed-safe chunks. */
export class OwnedWordBoundaryIndex implements WordBoundaryIndex {
  private readonly source: SourceBoundaryIndex;
  private readonly locale: string;
  private readonly state: NativeWordState;

  constructor(source: SourceBoundaryIndex, locale: string, state?: NativeWordState) {
    this.source = source;
    this.locale = locale;
    this.state = state ?? { starts: [], ends: [], iterator: undefined, complete: false, pending: undefined };
  }

  forSource(source: SourceBoundaryIndex): OwnedWordBoundaryIndex {
    return new OwnedWordBoundaryIndex(source, this.locale, this.state);
  }

  *prepareThroughWork(offset: number): Generator<void, void> {
    const bounded = clampTextOffset(offset, this.source.source.length);
    // Materializing a native locale segmenter's input and each native callback
    // are indivisible. The iterator and accepted numeric state survive yields.
    let operations = 0;
    while (!this.state.complete && (this.state.ends.at(-1) ?? -1) <= bounded) {
      this.state.iterator ??= wordSegmenter(this.locale).segment(this.source.source.slice(0))[Symbol.iterator]();
      if (this.state.pending === undefined) {
        const next = this.state.iterator.next();
        if (next.done === true) {
          this.state.complete = true;
          this.state.iterator = undefined;
          break;
        }
        if (next.value.isWordLike === true) {
          this.state.pending = { start: next.value.index, end: next.value.index + next.value.segment.length };
        }
      }
      const pending = this.state.pending;
      if (pending !== undefined) {
        yield* this.source.prepareThroughWork(pending.end);
        // Preparation may be cancelled or another reader may run during a yield.
        // Keep the uncommitted native result on the owner, never on the generator.
        if (this.state.pending !== pending) continue;
        const startOffset = normalizeSourceCursor(this.source, pending.start);
        const endOffset = normalizeSourceCursor(this.source, pending.end);
        if (startOffset !== endOffset) {
          this.state.starts.push(startOffset);
          this.state.ends.push(endOffset);
        }
        this.state.pending = undefined;
        if (pending.end === this.source.source.length) {
          this.state.complete = true;
          this.state.iterator = undefined;
        }
      }
      if (++operations % 256 === 0) yield;
    }
  }

  previous(offset: number): number {
    const cursor = this.cursor(offset);
    return this.state.starts[lowerBound(this.state.starts, cursor) - 1] ?? 0;
  }

  next(offset: number): number {
    const cursor = this.cursor(offset);
    return this.state.ends[upperBound(this.state.ends, cursor)] ?? this.source.source.length;
  }

  selectionAt(offset: number): TextSelection {
    const cursor = this.cursor(offset);
    const index = upperBound(this.state.starts, cursor) - 1;
    const start = this.state.starts[index];
    const end = this.state.ends[index];
    return start !== undefined && end !== undefined && cursor >= start
      && (cursor < end || (this.state.complete && index === this.state.starts.length - 1 && cursor === end))
      ? { startOffset: start, endOffsetExclusive: end }
      : { startOffset: cursor, endOffsetExclusive: cursor };
  }

  private cursor(offset: number): number {
    finishWork(this.source.prepareThroughWork(clampTextOffset(offset, this.source.source.length)));
    const cursor = normalizeSourceCursor(this.source, offset);
    finishWork(this.prepareThroughWork(cursor));
    return cursor;
  }
}

export function wordSelectionAt(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): TextSelection {
  return standaloneWordBoundaryIndex(text, options).selectionAt(offset);
}

export function lineSelectionAt(text: string, offset: number): TextSelection {
  const cursor = clampTextOffset(offset, text.length);
  return {
    startOffset: lineStartOffset(text, cursor),
    endOffsetExclusive: lineEndOffset(text, cursor)
  };
}

export function lineStartOffset(text: string, offset: number): number {
  const cursor = normalizeLogicalLineOffset(text, offset);
  const starts = lineStartOffsets(text);
  return starts[currentLineIndex(starts, cursor)] ?? 0;
}

export function lineEndOffset(text: string, offset: number): number {
  const cursor = normalizeLogicalLineOffset(text, offset);
  for (let index = cursor; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10 || code === 13) return index;
  }
  return text.length;
}

export function previousWordBoundary(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): number {
  return standaloneWordBoundaryIndex(text, options).previous(offset);
}

export function nextWordBoundary(
  text: string,
  offset: number,
  options: TextBoundaryOptions = {}
): number {
  return standaloneWordBoundaryIndex(text, options).next(offset);
}

export function lineOffsetByDelta(text: string, offset: number, delta: number): number {
  return sourceLineOffsetByDelta(sourceBoundaries(text), text, offset, delta);
}

export function sourceLineOffsetByDelta(source: SourceBoundaryIndex, text: string, offset: number, delta: number): number {
  const cursor = normalizeLogicalLineOffset(text, normalizeSourceCursor(source, offset));
  const starts = ownedLineStarts.get(source) ?? lineStartOffsets(text);
  ownedLineStarts.set(source, starts);
  const current = currentLineIndex(starts, cursor);
  const target = Math.max(0, Math.min(starts.length - 1, current + Math.trunc(delta)));
  const geometry = sourceGeometry(source);
  const column = geometry.columnAt(cursor) - geometry.columnAt(starts[current] ?? 0);
  const targetStart = starts[target] ?? 0;
  const targetEnd = lineEndOffset(text, targetStart);
  return Math.min(targetEnd, geometry.offsetAt(geometry.columnAt(targetStart) + column));
}

function standaloneWordBoundaryIndex(
  text: string,
  options: TextBoundaryOptions
): WordBoundaryIndex {
  const locale = wordSegmenter(options.locale).resolvedOptions().locale;
  const key = `${locale}\u0000${text}`;
  const cached = wordIndexes.get(key);
  if (cached !== undefined) {
    wordIndexes.delete(key);
    wordIndexes.set(key, cached);
    return cached;
  }
  const index = ownedWordBoundaryIndex(sourceBoundaries(text), { locale });
  const weight = key.length * 2 + text.length * 64;
  if (weight <= wordCacheLimit / 2) {
    wordIndexes.set(key, index);
    wordCacheBytes += weight;
    while (wordCacheBytes > wordCacheLimit) {
      const oldest = wordIndexes.entries().next().value;
      if (oldest === undefined) break;
      wordIndexes.delete(oldest[0]);
      wordCacheBytes -= oldest[0].length * 2 + oldest[0].slice(oldest[0].indexOf('\u0000') + 1).length * 64;
    }
  }
  return index;
}

function lowerBound(values: readonly number[], target: number): number {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((values[middle] ?? 0) < target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function upperBound(values: readonly number[], target: number): number {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((values[middle] ?? 0) <= target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function lineStartOffsets(text: string): readonly number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) index += 1;
      offsets.push(index + 1);
    } else if (code === 10) {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function normalizeLogicalLineOffset(text: string, offset: number): number {
  const cursor = clampTextOffset(offset, text.length);
  return cursor > 0
    && cursor < text.length
    && text.charCodeAt(cursor - 1) === 13
    && text.charCodeAt(cursor) === 10
    ? cursor - 1
    : cursor;
}

function currentLineIndex(starts: readonly number[], cursor: number): number {
  let current = 0;
  for (const [index, start] of starts.entries()) {
    if (start > cursor) break;
    current = index;
  }
  return current;
}
