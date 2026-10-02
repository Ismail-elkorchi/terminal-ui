import type { GraphemeSegment, TextBoundaryOptions, TextMeasurementOptions } from './types.ts';
import { eastAsianAmbiguousRanges, eastAsianWideRanges } from './unicode-width-data.ts';
import { defaultTextWidthProfile, defineTextWidthProfile, textWidthProfileKey } from './width-profile.ts';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Source indexes contain only Unicode boundaries. Geometry caches may be rebuilt
// for another width profile without asking the segmenter to reinterpret offsets.
// Reserve an upper bound, including UTF-16 source and numeric offset storage,
// before retaining an index. Very large strings still work, but are not cached.
const boundaryCacheLimit = 33_554_432;
const boundaryCache = new Map<string, SourceBoundaries>();
let boundaryCacheBytes = 0;

interface SourceBoundaries {
  readonly offsets: number[];
  readonly length: number;
  iterator: Iterator<Intl.SegmentData> | undefined;
}

function sourceBoundaries(text: string): SourceBoundaries | undefined {
  const cached = boundaryCache.get(text);
  if (cached !== undefined) {
    boundaryCache.delete(text);
    boundaryCache.set(text, cached);
    return cached;
  }
  const weight = boundaryWeight(text);
  if (weight > boundaryCacheLimit / 2) return undefined;
  const boundaries: SourceBoundaries = {
    offsets: [0],
    length: text.length,
    iterator: text.length === 0 ? undefined : graphemeSegmenter.segment(text)[Symbol.iterator](),
  };
  boundaryCache.set(text, boundaries);
  boundaryCacheBytes += weight;
  while (boundaryCacheBytes > boundaryCacheLimit) {
    const oldest = boundaryCache.keys().next().value;
    if (oldest === undefined) break;
    boundaryCache.delete(oldest);
    boundaryCacheBytes -= boundaryWeight(oldest);
  }
  return boundaries;
}

function boundaryWeight(text: string): number {
  return 128 + text.length * 18;
}

function extendBoundaries(boundaries: SourceBoundaries, offset: number): void {
  while (boundaries.iterator !== undefined && (boundaries.offsets.at(-1) ?? 0) <= offset) {
    const next = boundaries.iterator.next();
    if (next.done === true) boundaries.iterator = undefined;
    else {
      const end = next.value.index + next.value.segment.length;
      boundaries.offsets.push(end);
      if (end === boundaries.length) boundaries.iterator = undefined;
    }
  }
}

/** Source segmentation shared by editing, matching and lazy measurement. */
export function* graphemeSegments(text: string): IterableIterator<{
  readonly segment: string;
  readonly index: number;
}> {
  const boundaries = sourceBoundaries(text);
  if (boundaries === undefined) {
    // Oversized sources remain true streams: do not accumulate an off-screen
    // boundary table merely because a caller wants lazy width measurements.
    for (const segment of graphemeSegmenter.segment(text)) {
      yield { segment: segment.segment, index: segment.index };
    }
    return;
  }
  let index = 0;
  let at = 0;
  while (index < text.length) {
    extendBoundaries(boundaries, index);
    // The iterator and boundary queries share the same offsets, even when a
    // consumer interleaves them or abandons lazy measurement partway through.
    const end = boundaries.offsets[at + 1] ?? text.length;
    yield { segment: text.slice(index, end), index };
    index = end;
    at += 1;
  }
}

function boundaryIndex(offsets: readonly number[], offset: number): number {
  let lower = 0;
  let upper = offsets.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((offsets[middle] ?? 0) <= offset) lower = middle + 1;
    else upper = middle;
  }
  return Math.max(0, lower - 1);
}

/** Iterates measured source graphemes lazily without materializing the whole string. */
export function* measuredGraphemes(
  text: string,
  options: TextMeasurementOptions = {},
): IterableIterator<GraphemeSegment> {
  const measurement = { widthProfile: defineTextWidthProfile(options.widthProfile) };
  for (const segment of graphemeSegments(text)) {
    yield {
      text: segment.segment,
      startOffset: segment.index,
      endOffsetExclusive: segment.index + segment.segment.length,
      cells: measureGraphemeCells(segment.segment, measurement),
    };
  }
}

/** Resolve an offset using the same iterator boundaries as every text operation.
 * The first lookup may traverse the line prefix; subsequent lookups reuse it.
 * A single long grapheme still requires its complete segmentation context. */
export function graphemeAt(text: string, offset: number): { readonly startOffset: number; readonly endOffsetExclusive: number } | undefined {
  if (!Number.isFinite(offset) || offset < 0 || offset >= text.length) return undefined;
  const boundaries = sourceBoundaries(text);
  if (boundaries === undefined) {
    for (const segment of graphemeSegments(text)) {
      const end = segment.index + segment.segment.length;
      if (offset < end) return { startOffset: segment.index, endOffsetExclusive: end };
    }
    return undefined;
  }
  extendBoundaries(boundaries, offset);
  const index = boundaryIndex(boundaries.offsets, offset);
  return {
    startOffset: boundaries.offsets[index] ?? 0,
    endOffsetExclusive: boundaries.offsets[index + 1] ?? text.length,
  };
}

export function graphemeBoundaryOffsets(text: string): readonly number[] {
  const boundaries = sourceBoundaries(text);
  if (boundaries === undefined) {
    const offsets = Array.from(graphemeSegments(text), (segment) => segment.index);
    offsets.push(text.length);
    return Object.freeze(offsets);
  }
  extendBoundaries(boundaries, text.length);
  return Object.freeze(boundaries.offsets);
}
const defaultWordLocale = 'en';
const wordSegmenterCacheLimit = 32;
const wordSegmenters = new Map<string, Intl.Segmenter>();
const segmentCacheWeightLimit = 65_536;
const segmentCacheMaxTextLength = 256;
const segmentCache = new Map<string, readonly GraphemeSegment[]>();
let segmentCacheWeight = 0;

export function segmentGraphemes(text: string): readonly GraphemeSegment[] {
  return segmentGraphemesForMeasurement(text, {});
}

export function segmentGraphemesForMeasurement(
  text: string,
  options: TextMeasurementOptions,
  onSegmentation?: (codeUnits: number) => void,
): readonly GraphemeSegment[] {
  const cacheKey = segmentCacheKey(text, options);
  if (cacheKey !== undefined) {
    const cached = segmentCache.get(cacheKey);
    if (cached !== undefined) {
      segmentCache.delete(cacheKey);
      segmentCache.set(cacheKey, cached);
      return cached;
    }
  }
  const segments = Object.freeze(Array.from(measuredGraphemes(text, options), segment => Object.freeze(segment)));
  onSegmentation?.(text.length);
  if (cacheKey !== undefined) {
    segmentCache.set(cacheKey, segments);
    segmentCacheWeight += cacheKey.length;
    trimSegmentCache();
  }
  return segments;
}

export function* segmentWords(text: string, options: TextBoundaryOptions = {}): Iterable<{
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
}> {
  for (const segment of wordSegmenter(options.locale).segment(text)) {
    if (segment.isWordLike === true) {
      yield {
        startOffset: segment.index,
        endOffsetExclusive: segment.index + segment.segment.length
      };
    }
  }
}

function wordSegmenter(locale = defaultWordLocale): Intl.Segmenter {
  const cached = wordSegmenters.get(locale);
  if (cached !== undefined) {
    wordSegmenters.delete(locale);
    wordSegmenters.set(locale, cached);
    return cached;
  }
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
  wordSegmenters.set(locale, segmenter);
  while (wordSegmenters.size > wordSegmenterCacheLimit) {
    const oldest = wordSegmenters.keys().next().value;
    if (oldest === undefined) break;
    wordSegmenters.delete(oldest);
  }
  return segmenter;
}

function measureGraphemeCells(text: string, options: TextMeasurementOptions): number {
  if (text.length === 0) return 0;
  if (text.length === 1 && text.charCodeAt(0) >= 0x20 && text.charCodeAt(0) <= 0x7e) return 1;
  const profile = options.widthProfile ?? defaultTextWidthProfile;
  const codePoints = Array.from(text, (value) => value.codePointAt(0) ?? 0);
  const visible = codePoints.filter((value) => !isZeroWidthCodePoint(value));
  if (visible.length === 0) return 0;
  if (profile.emoji === 'codepoint' && hasEmojiPresentation(text)) {
    return visible.reduce((cells, value) => cells + (inRanges(value, eastAsianWideRanges)
      || (profile.ambiguous === 'wide' && inRanges(value, eastAsianAmbiguousRanges)) ? 2 : 1), 0);
  }
  if (hasEmojiPresentation(text)) return profile.emoji === 'wide' ? 2 : 1;
  if (visible.some((value) => inRanges(value, eastAsianWideRanges))) return 2;
  if (profile.ambiguous === 'wide'
    && visible.some((value) => inRanges(value, eastAsianAmbiguousRanges))) return 2;
  return 1;
}

function segmentCacheKey(text: string, options: TextMeasurementOptions): string | undefined {
  if (text.length > segmentCacheMaxTextLength) return undefined;
  return `${textWidthProfileKey(options.widthProfile)}\u0000${text}`;
}

function isZeroWidthCodePoint(value: number): boolean {
  const text = String.fromCodePoint(value);
  return /[\p{Nonspacing_Mark}\p{Enclosing_Mark}\p{Default_Ignorable_Code_Point}]/u.test(text);
}

function hasEmojiPresentation(text: string): boolean {
  if (text.includes('\uFE0E')) return false;
  return text.includes('\uFE0F')
    || /\p{Emoji_Presentation}/u.test(text)
    || /\p{Emoji_Modifier}/u.test(text)
    || /\p{Regional_Indicator}/u.test(text)
    || (text.includes('\u200D') && /\p{Extended_Pictographic}/u.test(text));
}

function inRanges(value: number, ranges: readonly (readonly [number, number])[]): boolean {
  let lower = 0;
  let upper = ranges.length - 1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const range = ranges[middle];
    if (range === undefined) return false;
    if (value < range[0]) upper = middle - 1;
    else if (value > range[1]) lower = middle + 1;
    else return true;
  }
  return false;
}

function trimSegmentCache(): void {
  while (segmentCacheWeight > segmentCacheWeightLimit) {
    const oldest = segmentCache.entries().next().value;
    if (oldest === undefined) return;
    segmentCache.delete(oldest[0]);
    segmentCacheWeight -= oldest[0].length;
  }
}
