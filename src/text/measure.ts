import { segmentGraphemesForMeasurement, measuredGraphemes } from './graphemes.ts';
import { sanitizeTerminalCellText, sanitizeTerminalText } from './sanitize.ts';
import type { TextCellMetrics, TextMeasurementOptions } from './types.ts';
import { textWidthProfileKey } from './width-profile.ts';

const measurementCacheWeightLimit = 65_536;
const measurementCacheMaxTextLength = 256;
const measurementCache = new Map<string, TextCellMetrics>();
let measurementCacheWeight = 0;

/** Width-only callers do not need an allocated grapheme index. */
export function measureTextWidth(text: string, options: TextMeasurementOptions = {}): number {
  const sanitized = sanitizeTerminalText(text).text;
  if (/^[\x20-\x7e]*$/u.test(sanitized)) return sanitized.length;
  if (sanitized.length <= measurementCacheMaxTextLength) return measureText(sanitized, options, 'text').cells;
  let cells = 0;
  for (const part of measuredGraphemes(sanitized, options)) cells += part.cells;
  return cells;
}

export function measureTextCells(
  text: string,
  options: TextMeasurementOptions = {},
  onSegmentation?: (codeUnits: number) => void,
): TextCellMetrics {
  return measureText(text, options, 'text', onSegmentation);
}

export function measureTerminalCellText(
  text: string,
  options: TextMeasurementOptions = {},
): TextCellMetrics {
  return measureText(text, options, 'cell');
}

/** Lazily measures long spans so clipping never materializes their off-screen tail. */
export function* terminalCellGraphemes(
  text: string,
  options: TextMeasurementOptions,
  onSegmentation?: (codeUnits: number) => void,
): IterableIterator<import('./types.ts').GraphemeSegment> {
  if (text.length <= measurementCacheMaxTextLength) {
    yield* measureText(text, options, 'cell', onSegmentation).graphemes;
    return;
  }
  const sanitized = sanitizeTerminalCellText(text).text;
  let processed = 0;
  try {
    for (const part of measuredGraphemes(sanitized, options)) {
      processed = part.endOffsetExclusive;
      yield part;
    }
  } finally {
    onSegmentation?.(processed);
  }
}

function measureText(
  text: string,
  options: TextMeasurementOptions,
  mode: 'text' | 'cell',
  onSegmentation?: (codeUnits: number) => void,
): TextCellMetrics {
  const cacheKey = measurementCacheKey(text, options, mode);
  if (cacheKey !== undefined) {
    const cached = measurementCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const sanitized = mode === 'cell'
    ? sanitizeTerminalCellText(text)
    : sanitizeTerminalText(text);
  const graphemes = segmentGraphemesForMeasurement(sanitized.text, options, onSegmentation);
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
