import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { sanitizeTerminalText } from './sanitize.ts';
import type { TextCellMetrics, TextMeasurementOptions } from './types.ts';

export function measureTextCells(
  text: string,
  options: TextMeasurementOptions = {}
): TextCellMetrics {
  const sanitized = sanitizeTerminalText(text);
  const graphemes = segmentGraphemesForMeasurement(sanitized.text, options);
  return {
    text: sanitized.text,
    graphemes,
    cells: graphemes.reduce((sum, segment) => sum + segment.cells, 0),
    codeUnits: sanitized.text.length,
    hasControlSequences: sanitized.changed
  };
}
