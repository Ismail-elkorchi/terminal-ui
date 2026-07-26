import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { MeterResult } from '../../ui-model/feedback.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { block, line, span } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { stringify } from './render-node-props.ts';
import { mergeStyles, themeStyle } from './render-node-style.ts';

export type ChartSurfaceKind = 'sparkline' | 'barChart' | 'chart' | 'meter' | 'heatmap';
export type ChartStateKind = 'empty' | 'loading' | 'error';
type ChartVisualNode = {
  readonly [TKind in ChartSurfaceKind]: RenderNodeOfKind<unknown, TKind>;
}[ChartSurfaceKind];
type ChartDataNode = Exclude<ChartVisualNode, RenderNodeOfKind<unknown, 'meter'>>;
export type ChartVisualKind =
  | 'area'
  | 'axis'
  | 'baseline'
  | 'bar'
  | 'cell'
  | 'frame'
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
  | 'result'
  | 'threshold';

export function chartStateBlock(
  renderNode: ChartDataNode,
  kind: ChartSurfaceKind,
  theme: TerminalTheme,
  input: {
    readonly empty: boolean;
    readonly emptyText: string;
    readonly loadingText?: string;
    readonly errorText?: string;
  }
): RenderBlock | undefined {
  const dataState = renderNode.props.dataState;
  if (dataState === 'loading') {
    return chartMessageBlock(renderNode, kind, 'loading', theme, input.loadingText, 'Loading data');
  }
  if (dataState === 'error') {
    return chartMessageBlock(renderNode, kind, 'error', theme, input.errorText, 'Unable to render data');
  }
  if (input.empty) {
    return chartMessageBlock(renderNode, kind, 'empty', theme, input.emptyText, 'No data');
  }
  return undefined;
}

export function chartTextFromBlock(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

export function chartSpan(
  renderNode: ChartVisualNode,
  kind: ChartSurfaceKind,
  visual: ChartVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: chartSource(renderNode, kind, visual, label)
  });
}

export function chartSource(
  renderNode: ChartVisualNode,
  kind: ChartSurfaceKind,
  visual: ChartVisualKind,
  label: string
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: kind,
    cellRole: roleForVisual(visual),
    partName: label,
    partType: visual,
    description: label
  });
}

export function chartLabelStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.label'), renderNode.styles?.parts?.['label']);
}

export function chartValueStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.value'), renderNode.styles?.parts?.['value']);
}

export function chartSelectedStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
      bold: true
    },
    renderNode.styles?.states?.selected
  );
}

export function chartPlaceholderStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.muted', { dim: true }), renderNode.styles?.parts?.['muted']);
}

export function chartAxisStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.axis', { dim: true }), renderNode.styles?.parts?.['axis']);
}

export function chartBaselineStyle(renderNode: ChartVisualNode): TerminalStyle | undefined {
  return mergeStyles(themeStyle('chart.baseline', { dim: true }), renderNode.styles?.parts?.['baseline']);
}

export function chartPolarityStyle(renderNode: ChartVisualNode, polarity: 'positive' | 'negative'): TerminalStyle | undefined {
  return mergeStyles(
    themeStyle(polarity === 'positive' ? 'chart.positive' : 'chart.negative', { bold: true }),
    renderNode.styles?.parts?.['series']
  );
}

export function chartSeriesStyle(renderNode: ChartVisualNode, index: number): TerminalStyle | undefined {
  return mergeStyles(themeStyle(chartSeriesToken(index), { bold: true }), renderNode.styles?.parts?.['series']);
}

export function chartHeatmapStyle(renderNode: ChartVisualNode, intensity: number, selected: boolean): TerminalStyle | undefined {
  if (selected) return chartSelectedStyle(renderNode);
  if (intensity <= 0) return chartPlaceholderStyle(renderNode);
  return mergeStyles(
    themeStyle('chart.series.1'),
    renderNode.styles?.parts?.['series'],
    intensity === 1 ? { dim: true, bold: false } : undefined,
    intensity >= 3 ? { bold: true } : undefined
  );
}

export function meterMetricStyle(renderNode: ChartVisualNode, result?: MeterResult): TerminalStyle | undefined {
  if (result === undefined) return chartSeriesStyle(renderNode, 0);
  return mergeStyles(
    chartValueStyle(renderNode),
    statusStyle(result)
  );
}

function chartSeriesToken(index: number): 'chart.series.1' | 'chart.series.2' | 'chart.series.3' {
  const normalized = Math.max(0, Math.floor(index)) % 3;
  if (normalized === 1) return 'chart.series.2';
  if (normalized === 2) return 'chart.series.3';
  return 'chart.series.1';
}

export function chartStateDescription(renderNode: ChartDataNode, fallback: string): string {
  return cleanStateText(renderNode.props.emptyText, fallback);
}

function chartMessageBlock(
  renderNode: ChartVisualNode,
  kind: ChartSurfaceKind,
  state: ChartStateKind,
  theme: TerminalTheme,
  text: string | undefined,
  fallback: string
): RenderBlock {
  const status = state === 'loading' ? 'running' : state === 'error' ? 'error' : 'idle';
  const messageStyle = state === 'empty' ? chartPlaceholderStyle(renderNode) : statusStyle(status);
  return block([line([
    chartSpan(renderNode, kind, 'marker', `state.${state}.marker`, statusMarker(status, theme), messageStyle),
    chartSpan(renderNode, kind, 'separator', `state.${state}.separator`, ' ', chartPlaceholderStyle(renderNode)),
    chartSpan(renderNode, kind, state, `state.${state}.message`, cleanStateText(text, fallback), messageStyle)
  ])]);
}

function cleanStateText(value: unknown, fallback: string): string {
  const cleaned = sanitizeTerminalText(stringify(value)).text.replace(/\s*\n\s*/gu, ' ').trim();
  return cleaned.length === 0 ? fallback : cleaned;
}

function roleForVisual(visual: ChartVisualKind): NonNullable<FrameCellSource['cellRole']> {
  switch (visual) {
    case 'separator':
      return 'separator';
    case 'baseline':
      return 'separator';
    case 'frame':
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
    case 'result':
      return 'text';
  }
}
