import type { GraphemeSegment, TextMeasurementOptions } from './types.ts';
import { eastAsianAmbiguousRanges, eastAsianWideRanges } from './unicode-width-data.ts';
import { defaultTextWidthProfile, textWidthProfileKey } from './width-profile.ts';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const segmentCacheLimit = 4096;
const segmentCacheMaxTextLength = 4096;
const segmentCache = new Map<string, readonly GraphemeSegment[]>();

export function segmentGraphemes(text: string): readonly GraphemeSegment[] {
  return segmentGraphemesForMeasurement(text, {});
}

export function segmentGraphemesForMeasurement(
  text: string,
  options: TextMeasurementOptions
): readonly GraphemeSegment[] {
  const cacheKey = segmentCacheKey(text, options);
  if (cacheKey !== undefined) {
    const cached = segmentCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const segments = Object.freeze([...segmenter.segment(text)].map((segment) => Object.freeze({
    text: segment.segment,
    startOffset: segment.index,
    endOffsetExclusive: segment.index + segment.segment.length,
    cells: measureGraphemeCells(segment.segment, options)
  })));
  if (cacheKey !== undefined) {
    segmentCache.set(cacheKey, segments);
    trimSegmentCache();
  }
  return segments;
}

function measureGraphemeCells(text: string, options: TextMeasurementOptions): number {
  if (text.length === 0) return 0;
  const profile = options.widthProfile ?? defaultTextWidthProfile;
  const codePoints = Array.from(text, (value) => value.codePointAt(0) ?? 0);
  const visible = codePoints.filter((value) => !isZeroWidthCodePoint(value));
  if (visible.length === 0) return 0;
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
  while (segmentCache.size > segmentCacheLimit) {
    const oldest = segmentCache.keys().next().value;
    if (oldest === undefined) return;
    segmentCache.delete(oldest);
  }
}
