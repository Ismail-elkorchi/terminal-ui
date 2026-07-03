import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { WidgetProcessStatus, Widget } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import { widgetFrameSource } from './frame-source.ts';
import { block, line, span } from './render-primitives.ts';
import type { FrameCellSource, RenderBlock, RenderSpan, TerminalStyle } from './render-primitives.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { stringify } from './widget-props.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';

export type ChartSurfaceKind = 'sparkline' | 'barChart' | 'chart' | 'gauge' | 'heatmap';
export type ChartStateKind = 'empty' | 'loading' | 'error';
export type ChartVisualKind =
  | 'axis'
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

export function chartStatus(value: unknown): WidgetProcessStatus | undefined {
  if (value === undefined) return undefined;
  return normalizeWidgetProcessStatus(value, 'idle');
}

export function chartStateBlock(
  widget: Widget,
  kind: ChartSurfaceKind,
  theme: TerminalTheme,
  input: {
    readonly empty: boolean;
    readonly emptyText: string;
    readonly loadingText?: string;
    readonly errorText?: string;
  }
): RenderBlock | undefined {
  const status = chartStatus(widget.props['status']);
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
  widget: Widget,
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
  widget: Widget,
  kind: ChartSurfaceKind,
  visual: ChartVisualKind,
  label: string
): FrameCellSource {
  return widgetFrameSource(widget, {
    family: kind,
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    label
  });
}

export function chartLabelStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'label');
}

export function chartValueStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'value');
}

export function chartSelectedStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'value', 'selected');
}

export function chartPlaceholderStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

export function chartMetricStyle(widget: Widget, status?: WidgetProcessStatus): TerminalStyle | undefined {
  return mergeStyles(
    widgetStyle(widget, 'value'),
    status === undefined || status === 'idle' ? undefined : statusStyle(status)
  );
}

export function chartStateDescription(widget: Widget, fallback: string): string {
  return cleanStateText(widget.props['emptyText'], fallback);
}

function chartMessageBlock(
  widget: Widget,
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
    case 'chrome':
    case 'fill':
    case 'marker':
      return 'decoration';
    case 'axis':
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
