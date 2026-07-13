import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { ProcessStatus } from '../../ui-model/contracts.ts';
import { normalizeProcessStatus } from '../../ui-model/status.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { block, line, span } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { stringify } from './render-node-props.ts';
import { mergeStyles, themeStyle } from './render-node-style.ts';

export type ChartSurfaceKind = 'sparkline' | 'barChart' | 'chart' | 'gauge' | 'heatmap';
export type ChartStateKind = 'empty' | 'loading' | 'error';
type ChartVisualNode = {
  readonly [TKind in ChartSurfaceKind]: RenderNodeOfKind<unknown, TKind>;
}[ChartSurfaceKind];
type ChartDataNode = Exclude<ChartVisualNode, RenderNodeOfKind<unknown, 'gauge'>>;
export type ChartVisualKind =
  | 'area'
  | 'axis'
  | 'baseline'
  | 'bar'
  | 'cell'
  | 'chrome'
  | 'empty'
  | 'error'
  | 'fill'
  | 'label'
  | 'legend'
  | 'line'
  | 'loading'
  | 'marker'
  | 'metric'
  | 'point'
  | 'selected'
  | 'separator'
  | 'series'
  | 'status'
  | 'threshold';

export function chartStatus(value: unknown): ProcessStatus | undefined {
  if (value === undefined) return undefined;
  return normalizeProcessStatus(value, 'idle');
}

export function chartStateBlock(
  widget: ChartDataNode,
  kind: ChartSurfaceKind,
  theme: TerminalTheme,
  input: {
    readonly empty: boolean;
    readonly emptyText: string;
    readonly loadingText?: string;
    readonly errorText?: string;
  }
): RenderBlock | undefined {
  const status = chartStatus(widget.props.status);
  if (status === 'running') {
    return chartMessageBlock(widget, kind, 'loading', theme, input.loadingText, 'Loading data');
  }
  if (status === 'error') {
    return chartMessageBlock(widget, kind, 'error', theme, input.errorText, 'Unable to render data');
  }
  if (input.empty) {
    return chartMessageBlock(widget, kind, 'empty', theme, input.emptyText, 'No data');
  }
  return undefined;
}

export function chartTextFromBlock(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

export function chartSpan(
  widget: ChartVisualNode,
  kind: ChartSurfaceKind,
  visual: ChartVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: chartSource(widget, kind, visual, label)
  });
}

export function chartSource(
  widget: ChartVisualNode,
  kind: ChartSurfaceKind,
  visual: ChartVisualKind,
  label: string
): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: kind,
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    label
  });
}

export function chartLabelStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.label'), widget.styles?.parts?.['label']);
}

export function chartValueStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.value'), widget.styles?.parts?.['value']);
}

export function chartSelectedStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
      bold: true
    },
    widget.styles?.states?.selected
  );
}

export function chartPlaceholderStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.muted', { dim: true }), widget.styles?.parts?.['muted']);
}

export function chartAxisStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.axis', { dim: true }), widget.styles?.parts?.['axis']);
}

export function chartBaselineStyle(widget: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.baseline', { dim: true }), widget.styles?.parts?.['baseline']);
}

export function chartPolarityStyle(widget: ChartVisualNode, polarity: 'positive' | 'negative'): TerminalStyle | undefined {
  return mergeStyles(
    themeStyle(polarity === 'positive' ? 'chart.positive' : 'chart.negative', { bold: true }),
    widget.styles?.parts?.['series']
  );
}

export function chartSeriesStyle(widget: ChartVisualNode, index: number): TerminalStyle | undefined {
  return mergeStyles(themeStyle(chartSeriesToken(index), { bold: true }), widget.styles?.parts?.['series']);
}

export function chartHeatmapStyle(widget: ChartVisualNode, intensity: number, selected: boolean): TerminalStyle | undefined {
  if (selected) return chartSelectedStyle(widget);
  if (intensity <= 0) return chartPlaceholderStyle(widget);
  return mergeStyles(
    themeStyle('chart.series.1'),
    widget.styles?.parts?.['series'],
    intensity === 1 ? { dim: true, bold: false } : undefined,
    intensity >= 3 ? { bold: true } : undefined
  );
}

export function chartMetricStyle(widget: ChartVisualNode, status?: ProcessStatus): TerminalStyle | undefined {
  if (status === undefined || status === 'idle' || status === 'running') {
    return chartSeriesStyle(widget, 0);
  }
  return mergeStyles(
    chartValueStyle(widget),
    statusStyle(status)
  );
}

function chartSeriesToken(index: number): 'chart.series.1' | 'chart.series.2' | 'chart.series.3' {
  const normalized = Math.max(0, Math.floor(index)) % 3;
  if (normalized === 1) return 'chart.series.2';
  if (normalized === 2) return 'chart.series.3';
  return 'chart.series.1';
}

export function chartStateDescription(widget: ChartDataNode, fallback: string): string {
  return cleanStateText(widget.props.emptyText, fallback);
}

function chartMessageBlock(
  widget: ChartVisualNode,
  kind: ChartSurfaceKind,
  state: ChartStateKind,
  theme: TerminalTheme,
  text: string | undefined,
  fallback: string
): RenderBlock {
  const status = state === 'loading' ? 'running' : state === 'error' ? 'error' : 'idle';
  const messageStyle = state === 'empty' ? chartPlaceholderStyle(widget) : statusStyle(status);
  return block([line([
    chartSpan(widget, kind, 'marker', `state.${state}.marker`, statusMarker(status, theme), messageStyle),
    chartSpan(widget, kind, 'separator', `state.${state}.separator`, ' ', chartPlaceholderStyle(widget)),
    chartSpan(widget, kind, state, `state.${state}.message`, cleanStateText(text, fallback), messageStyle)
  ])]);
}

function cleanStateText(value: unknown, fallback: string): string {
  const cleaned = sanitizeTerminalText(stringify(value)).text.replace(/\s*\n\s*/gu, ' ').trim();
  return cleaned.length === 0 ? fallback : cleaned;
}

function roleForVisual(visual: ChartVisualKind): NonNullable<FrameCellSource['role']> {
  switch (visual) {
    case 'separator':
      return 'separator';
    case 'baseline':
      return 'separator';
    case 'chrome':
    case 'fill':
    case 'marker':
      return 'decoration';
    case 'axis':
    case 'area':
    case 'bar':
    case 'cell':
    case 'line':
    case 'point':
    case 'selected':
    case 'series':
    case 'threshold':
      return 'chart';
    case 'empty':
    case 'error':
    case 'label':
    case 'legend':
    case 'loading':
    case 'metric':
    case 'status':
      return 'text';
  }
}
