import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { finiteNonNegativeIntegerOrZero } from '../../foundation/validation.ts';
import { measureRenderBlock as renderBlockSize, measureRenderLine } from '../../visual/render.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import type { TextMeasurementOptions } from '../../text/index.ts';
import type { Measurement, MeasurementInput } from '../contracts.ts';

export function measurement(input: MeasurementInput): Measurement {
  return normalizeMeasurement({
    minWidth: input.minWidth ?? 0,
    minHeight: input.minHeight ?? 0,
    preferredWidth: input.preferredWidth,
    preferredHeight: input.preferredHeight,
    ...(input.maxWidth === undefined ? {} : { maxWidth: input.maxWidth }),
    ...(input.maxHeight === undefined ? {} : { maxHeight: input.maxHeight })
  });
}

export function normalizeMeasurement(measure: Measurement): Measurement {
  const minWidth = finiteNonNegativeIntegerOrZero(measure.minWidth);
  const minHeight = finiteNonNegativeIntegerOrZero(measure.minHeight);
  const maxWidth = optionalMaxSize(measure.maxWidth, minWidth);
  const maxHeight = optionalMaxSize(measure.maxHeight, minHeight);
  const preferredWidth = clampMeasurementAxis(measure.preferredWidth, minWidth, maxWidth);
  const preferredHeight = clampMeasurementAxis(measure.preferredHeight, minHeight, maxHeight);
  return {
    minWidth,
    minHeight,
    preferredWidth,
    preferredHeight,
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(maxHeight === undefined ? {} : { maxHeight })
  };
}

export function zeroMeasurement(): Measurement {
  return { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 };
}

export function clampMeasurement(measure: Measurement, limits: { readonly width?: number; readonly height?: number }): Measurement {
  return normalizeMeasurement({
    ...measure,
    ...(limits.width === undefined ? {} : { maxWidth: limits.width }),
    ...(limits.height === undefined ? {} : { maxHeight: limits.height })
  });
}

export function measureSize(preferredWidth: number, preferredHeight: number, minWidth = 0, minHeight = 0): Measurement {
  return measurement({ minWidth, minHeight, preferredWidth, preferredHeight });
}

export function measureText(text: string, options: TextMeasurementOptions = {}): Measurement {
  const lines = sanitizeTerminalText(text).text.split('\n');
  return measureLines(lines, options);
}

export function measureSpans(spans: readonly RenderSpan[], options: TextMeasurementOptions = {}): Measurement {
  return measureSize(spans.reduce(
    (sum, currentSpan) => sum + measureTextCells(currentSpan.text, options).cells,
    0
  ), 1);
}

export function measureLine(renderLine: RenderLine, options: TextMeasurementOptions = {}): Measurement {
  return measureSize(measureRenderLine(renderLine, options), 1);
}

export function measureBlock(block: RenderBlock, options: TextMeasurementOptions = {}): Measurement {
  const size = renderBlockSize(block, options);
  return measureSize(size.width, size.height);
}

export function measureLines(lines: readonly string[], options: TextMeasurementOptions = {}): Measurement {
  return measureSize(
    lines.reduce((max, currentLine) => Math.max(max, measureTextCells(currentLine, options).cells), 0),
    lines.length
  );
}

export function combineMeasurementsVertically(measures: readonly Measurement[], gap = 0): Measurement {
  if (measures.length === 0) return zeroMeasurement();
  const normalized = measures.map(normalizeMeasurement);
  const gapCells = finiteNonNegativeIntegerOrZero(gap) * Math.max(0, normalized.length - 1);
  return measurement({
    minWidth: normalized.reduce((max, current) => Math.max(max, current.minWidth), 0),
    minHeight: normalized.reduce((sum, current) => sum + current.minHeight, 0) + gapCells,
    preferredWidth: normalized.reduce((max, current) => Math.max(max, current.preferredWidth), 0),
    preferredHeight: normalized.reduce((sum, current) => sum + current.preferredHeight, 0) + gapCells
  });
}

export function combineMeasurementsHorizontally(measures: readonly Measurement[], gap = 0): Measurement {
  if (measures.length === 0) return zeroMeasurement();
  const normalized = measures.map(normalizeMeasurement);
  const gapCells = finiteNonNegativeIntegerOrZero(gap) * Math.max(0, normalized.length - 1);
  return measurement({
    minWidth: normalized.reduce((sum, current) => sum + current.minWidth, 0) + gapCells,
    minHeight: normalized.reduce((max, current) => Math.max(max, current.minHeight), 0),
    preferredWidth: normalized.reduce((sum, current) => sum + current.preferredWidth, 0) + gapCells,
    preferredHeight: normalized.reduce((max, current) => Math.max(max, current.preferredHeight), 0)
  });
}

export function combineMeasurementsOverlay(measures: readonly Measurement[]): Measurement {
  if (measures.length === 0) return zeroMeasurement();
  const normalized = measures.map(normalizeMeasurement);
  return measurement({
    minWidth: normalized.reduce((max, current) => Math.max(max, current.minWidth), 0),
    minHeight: normalized.reduce((max, current) => Math.max(max, current.minHeight), 0),
    preferredWidth: normalized.reduce((max, current) => Math.max(max, current.preferredWidth), 0),
    preferredHeight: normalized.reduce((max, current) => Math.max(max, current.preferredHeight), 0)
  });
}

function optionalMaxSize(value: number | undefined, min: number): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(min, Math.floor(value));
}

function clampMeasurementAxis(value: number, min: number, max: number | undefined): number {
  const preferred = Number.isFinite(value) ? Math.max(min, Math.floor(value)) : min;
  return max === undefined ? preferred : Math.min(preferred, Math.max(min, max));
}
