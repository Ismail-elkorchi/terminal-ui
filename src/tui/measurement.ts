import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { measureRenderBlock as renderBlockSize, measureRenderLine } from './render-primitives.ts';
import type { RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';
import type { WidgetMeasureResult } from './widget-renderer.ts';

export type Measurement = WidgetMeasureResult;

export interface MeasurementInput {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

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
  const minWidth = nonNegativeInteger(measure.minWidth);
  const minHeight = nonNegativeInteger(measure.minHeight);
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

export function measureText(text: string): Measurement {
  const lines = sanitizeTerminalText(text).text.split('\n');
  return measureLines(lines);
}

export function measureSpans(spans: readonly RenderSpan[]): Measurement {
  return measureSize(spans.reduce((sum, currentSpan) => sum + measureTextCells(sanitizeTerminalText(currentSpan.text).text).cells, 0), 1);
}

export function measureLine(renderLine: RenderLine): Measurement {
  return measureSize(measureRenderLine(renderLine), 1);
}

export function measureBlock(block: RenderBlock): Measurement {
  const size = renderBlockSize(block);
  return measureSize(size.width, size.height);
}

export function measureLines(lines: readonly string[]): Measurement {
  return measureSize(
    lines.reduce((max, currentLine) => Math.max(max, measureTextCells(sanitizeTerminalText(currentLine).text).cells), 0),
    lines.length
  );
}

export function combineMeasurementsVertically(measures: readonly Measurement[], gap = 0): Measurement {
  if (measures.length === 0) return zeroMeasurement();
  const normalized = measures.map(normalizeMeasurement);
  const gapCells = nonNegativeInteger(gap) * Math.max(0, normalized.length - 1);
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
  const gapCells = nonNegativeInteger(gap) * Math.max(0, normalized.length - 1);
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

function nonNegativeInteger(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));
}
