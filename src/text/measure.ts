import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { sanitizeTerminalCellText, sanitizeTerminalText } from './sanitize.ts';
import type { TextCellMetrics, TextMeasurementOptions } from './types.ts';
import { textWidthProfileKey } from './width-profile.ts';

const measurementCacheWeightLimit = 65_536;
const measurementCacheMaxTextLength = 256;
const measurementCache = new Map<string, TextCellMetrics>();
let measurementCacheWeight = 0;

export function measureTextCells(
  text: string,
  options: TextMeasurementOptions = {}
): TextCellMetrics {
  return measureSanitizedText(text, sanitizeTerminalText(text), options, 'text');
}

export function measureTerminalCellText(
  text: string,
  options: TextMeasurementOptions = {},
): TextCellMetrics {
  return measureSanitizedText(text, sanitizeTerminalCellText(text), options, 'cell');
}

function measureSanitizedText(
  source: string,
  sanitized: ReturnType<typeof sanitizeTerminalText>,
  options: TextMeasurementOptions,
  mode: 'text' | 'cell',
): TextCellMetrics {
  const cacheKey = measurementCacheKey(source, options, mode);
  if (cacheKey !== undefined) {
    const cached = measurementCache.get(cacheKey);
    if (cached !== undefined) {
      measurementCache.delete(cacheKey);
      measurementCache.set(cacheKey, cached);
      return cached;
    }
  }
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
    measurementCacheWeight += cacheKey.length;
    trimMeasurementCache();
  }
  return measured;
}

function measurementCacheKey(
  text: string,
  options: TextMeasurementOptions,
  mode: 'text' | 'cell',
): string | undefined {
  if (text.length > measurementCacheMaxTextLength) return undefined;
  return `${mode}\u0000${textWidthProfileKey(options.widthProfile)}\u0000${text}`;
}

function trimMeasurementCache(): void {
  while (measurementCacheWeight > measurementCacheWeightLimit) {
    const oldest = measurementCache.entries().next().value;
    if (oldest === undefined) return;
    measurementCache.delete(oldest[0]);
    measurementCacheWeight -= oldest[0].length;
  }
}
