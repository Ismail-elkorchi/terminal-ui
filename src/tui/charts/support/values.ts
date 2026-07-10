import type { BarChartItem } from '../../../components/options/feedback.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export function sparkGlyph(
  value: number,
  range: { readonly min: number; readonly max: number }
): string {
  return sparkGlyphs[normalizedIndex(value, range, sparkGlyphs.length - 1)] ?? sparkGlyphs[0];
}

export function normalizedIndex(
  value: number,
  range: { readonly min: number; readonly max: number },
  maxIndex: number
): number {
  if (range.max <= range.min) return 0;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
}

export function rangeFor(
  values: readonly number[],
  explicitMin: number | undefined,
  explicitMax: number | undefined
): { readonly min: number; readonly max: number } {
  const min = explicitMin ?? Math.min(...values);
  const max = explicitMax ?? Math.max(...values);
  return { min, max: max <= min ? min + 1 : max };
}

export function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

export function barItems(value: unknown): readonly BarChartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BarChartItem =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly label?: unknown }).label === 'string'
    && typeof (item as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((item as { readonly value: number }).value)
  );
}

export function boundedInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function cleanLabel(value: unknown): string {
  return typeof value === 'string' ? sanitizeTerminalText(value).text : '';
}
