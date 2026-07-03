import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { sanitizeTerminalText } from './sanitize.ts';
import type { TextCellMetrics, TextMeasurementOptions } from './types.ts';

const measurementCacheLimit = 4096;
const measurementCacheMaxTextLength = 4096;
const measurementCache = new Map<string, TextCellMetrics>();

export function measureTextCells(
  text: string,
  options: TextMeasurementOptions = {}
): TextCellMetrics {
  const cacheKey = measurementCacheKey(text, options);
  if (cacheKey !== undefined) {
    const cached = measurementCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const sanitized = sanitizeTerminalText(text);
  const graphemes = segmentGraphemesForMeasurement(sanitized.text, options);
  const measured = Object.freeze({
    text: sanitized.text,
    graphemes,
    cells: graphemes.reduce((sum, segment) => sum + segment.cells, 0),
    codeUnits: sanitized.text.length,
    hasControlSequences: sanitized.changed
  });
  if (cacheKey !== undefined) {
    measurementCache.set(cacheKey, measured);
    trimMeasurementCache();
  }
  return measured;
}

function measurementCacheKey(text: string, options: TextMeasurementOptions): string | undefined {
  if (text.length > measurementCacheMaxTextLength) return undefined;
  return `${options.emojiWidth ?? 'wide'}\u0000${text}`;
}

function trimMeasurementCache(): void {
  while (measurementCache.size > measurementCacheLimit) {
    const oldest = measurementCache.keys().next().value;
    if (oldest === undefined) return;
    measurementCache.delete(oldest);
  }
}
