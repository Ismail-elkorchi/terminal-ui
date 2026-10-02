import { sourceBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import type { GraphemeSegment, TextMeasurementOptions } from './types.ts';
import { eastAsianAmbiguousRanges, eastAsianWideRanges } from './unicode-width-data.ts';
import { defaultTextWidthProfile, defineTextWidthProfile, textWidthProfileKey } from './width-profile.ts';

/** Source segmentation shared by editing, matching and lazy measurement. */
export function graphemeSegments(text: string): IterableIterator<{
  readonly segment: string;
  readonly index: number;
}> {
  return sourceBoundaries(text).segments();
}

/** Iterates measured source graphemes lazily without materializing the whole string. */
export function* measuredGraphemes(
  text: string,
  options: TextMeasurementOptions = {},
): IterableIterator<GraphemeSegment> {
  yield* measuredSourceGraphemes(sourceBoundaries(text), options);
}

function* measuredSourceGraphemes(source: SourceBoundaryIndex, options: TextMeasurementOptions, text?: string): IterableIterator<GraphemeSegment> {
  const measurement = { widthProfile: defineTextWidthProfile(options.widthProfile) };
  for (const segment of source.segments(text)) {
    yield {
      text: segment.segment,
      startOffset: segment.index,
      endOffsetExclusive: segment.index + segment.segment.length,
      cells: measureGraphemeCells(segment.segment, measurement),
    };
  }
}

export function graphemeBoundaryOffsets(text: string): readonly number[] {
  return sourceBoundaries(text).offsets();
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
  source?: SourceBoundaryIndex,
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
  const segments = Object.freeze(Array.from(measuredSourceGraphemes(source ?? sourceBoundaries(text), options, text), segment => Object.freeze(segment)));
  onSegmentation?.(text.length);
  if (cacheKey !== undefined) {
    segmentCache.set(cacheKey, segments);
    segmentCacheWeight += cacheKey.length;
    trimSegmentCache();
  }
  return segments;
}

export function wordSegmenter(locale = defaultWordLocale): Intl.Segmenter {
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

export function measureGraphemeCells(text: string, options: TextMeasurementOptions): number {
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
