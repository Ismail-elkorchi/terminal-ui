import { sanitizeTerminalText } from '../text/index.ts';
import { createCanvas2D, drawLineSeries } from './canvas2d/index.ts';
import { createFrameBuffer } from './frame-buffer.ts';
import { numberProp } from './widget-props.ts';
import { visibleWindow } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { BarChartItem, ChartSeries, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export function sparklineText(widget: Widget): string {
  const values = numberArray(widget.props['values']);
  if (values.length === 0) return '';
  const range = rangeFor(values, numberProp(widget, 'min'), numberProp(widget, 'max'));
  return values.map((value) => sparkGlyph(value, range)).join('');
}

export function sparklineAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const values = numberArray(widget.props['values']);
  return {
    id,
    role: 'text',
    label: id,
    value: sparklineText(widget),
    description: `${String(values.length)} sparkline points.`
  };
}

export function barChartText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? -1;
  const max = Math.max(1, numberProp(widget, 'max') ?? Math.max(1, ...items.map((item) => item.value)));
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    const prefix = index === selected ? theme.symbols.pointer : theme.symbols.unselected;
    const label = sanitizeTerminalText(item.label).text;
    const available = Math.max(1, node.bounds.width - label.length - String(item.value).length - 5);
    const filled = Math.max(0, Math.min(available, Math.round((item.value / max) * available)));
    return `${prefix} ${label} ${theme.symbols.progressFilled.repeat(filled)} ${String(item.value)}`;
  }).join('\n');
}

export function barChartAccessibleBase(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? 0;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: `${String(items.length)} bars. Showing ${String(window.start + 1)}-${String(window.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function barChartAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    return {
      id: `${widget.id ?? 'bar-chart'}:${String(index)}`,
      role: 'option',
      label: sanitizeTerminalText(item.label).text,
      value: item.value,
      selected: index === selected
    };
  });
}

export function chartText(widget: Widget, node: LayoutNode): string {
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0 || node.bounds.height <= 0 || node.bounds.width <= 0) return '';
  const range = rangeFor(points, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const buffer = createFrameBuffer(node.bounds.width, node.bounds.height);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: node.bounds.width, height: node.bounds.height });
  for (const item of series) {
    const visible = item.points.slice(0, node.bounds.width);
    drawLineSeries(canvas, visible.map((value, column) => ({ x: column, y: value })), {
      yScale: { domain: [range.min, range.max], range: [node.bounds.height - 1, 0] },
      span: { text: '*' }
    });
  }
  return frameBufferText(buffer, node.bounds.width, node.bounds.height);
}

export function chartAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const series = chartSeries(widget.props['series']);
  return {
    id,
    role: 'text',
    label: id,
    description: `${String(series.length)} chart series.`
  };
}

function sparkGlyph(value: number, range: { readonly min: number; readonly max: number }): string {
  return sparkGlyphs[normalizedIndex(value, range, sparkGlyphs.length - 1)] ?? sparkGlyphs[0];
}

function normalizedIndex(value: number, range: { readonly min: number; readonly max: number }, maxIndex: number): number {
  if (range.max <= range.min) return 0;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
}

function rangeFor(values: readonly number[], explicitMin: number | undefined, explicitMax: number | undefined): { readonly min: number; readonly max: number } {
  const min = explicitMin ?? Math.min(...values);
  const max = explicitMax ?? Math.max(...values);
  return { min, max: max <= min ? min + 1 : max };
}

function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

function barItems(value: unknown): readonly BarChartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BarChartItem =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly label?: unknown }).label === 'string'
    && typeof (item as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((item as { readonly value: number }).value)
  );
}

function chartSeries(value: unknown): readonly ChartSeries[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChartSeries =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly id?: unknown }).id === 'string'
    && Array.isArray((item as { readonly points?: unknown }).points)
  ).map((item) => ({
    id: sanitizeTerminalText(item.id).text,
    ...(item.label === undefined ? {} : { label: sanitizeTerminalText(item.label).text }),
    points: numberArray(item.points)
  }));
}

function frameBufferText(buffer: ReturnType<typeof createFrameBuffer>, width: number, height: number): string {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
  for (const cell of buffer.snapshot().cells) {
    const row = rows[cell.row - 1];
    if (row === undefined || cell.column < 1 || cell.column > width) continue;
    row[cell.column - 1] = cell.text;
  }
  return rows.map((row) => row.join('').trimEnd()).join('\n');
}
