import type { GraphemeSegment, TextMeasurementOptions } from './types.ts';

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
    start: segment.index,
    end: segment.index + segment.segment.length,
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
  if (/^[\u0300-\u036F]+$/u.test(text)) return 0;
  if (/\p{Extended_Pictographic}/u.test(text)) return options.emojiWidth === 'narrow' ? 1 : 2;
  if (/[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(text)) {
    return 2;
  }
  return 1;
}

function segmentCacheKey(text: string, options: TextMeasurementOptions): string | undefined {
  if (text.length > segmentCacheMaxTextLength) return undefined;
  return `${options.emojiWidth ?? 'wide'}\u0000${text}`;
}

function trimSegmentCache(): void {
  while (segmentCache.size > segmentCacheLimit) {
    const oldest = segmentCache.keys().next().value;
    if (oldest === undefined) return;
    segmentCache.delete(oldest);
  }
}
