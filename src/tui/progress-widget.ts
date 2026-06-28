import { sanitizeTerminalText } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { ActivityIndicatorStatus, ProgressBarLabelPosition, ProgressBarMode, Widget } from '../widgets/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import { block, line, span } from './frame.ts';
import { activityStatus, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { RenderBlock } from './frame.ts';

interface ProgressModel {
  readonly label: string;
  readonly mode: ProgressBarMode;
  readonly labelPosition: ProgressBarLabelPosition;
  readonly status: ActivityIndicatorStatus;
  readonly indeterminate: boolean;
  readonly value: number;
  readonly max: number;
  readonly barWidth: number;
  readonly filled: number;
  readonly showPercentage: boolean;
  readonly percentage: number;
}

export function progressBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const model = progressModel(widget);
  const content = [
    ...(model.label.length > 0 && model.labelPosition === 'start' ? [span(`${model.label} `)] : []),
    span('[', { style: statusStyle('idle') }),
    ...progressBarSpans(model, theme),
    span(']', { style: statusStyle('idle') }),
    ...progressMetricSpans(model),
    ...(model.label.length > 0 && model.labelPosition === 'end' ? [span(` ${model.label}`)] : [])
  ];
  return block([line(content)]);
}

export function progressText(widget: Widget, theme: TerminalTheme): string {
  return progressBlock(widget, theme).lines.map((currentLine) => currentLine.spans.map((currentSpan) => currentSpan.text).join('')).join('\n');
}

export function progressAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const model = progressModel(widget);
  if (model.indeterminate) {
    return {
      id,
      role: 'progressbar',
      label: model.label || id,
      progress: { indeterminate: true }
    };
  }
  return {
    id,
    role: 'progressbar',
    label: model.label || id,
    progress: { value: model.value, max: model.max }
  };
}

function progressBarSpans(model: ProgressModel, theme: TerminalTheme) {
  if (model.indeterminate) {
    return [span(theme.symbols.progressEmpty.repeat(model.barWidth), { style: statusStyle('idle') })];
  }
  return [
    span(theme.symbols.progressFilled.repeat(model.filled), { style: statusStyle(model.status) }),
    span(theme.symbols.progressEmpty.repeat(model.barWidth - model.filled), { style: statusStyle('idle') })
  ];
}

function progressMetricSpans(model: ProgressModel) {
  if (model.indeterminate) return [];
  if (model.mode === 'compact') {
    return model.showPercentage ? [span(` ${String(model.percentage)}%`)] : [];
  }
  return [
    span(` ${String(model.value)}/${String(model.max)}`),
    ...(model.showPercentage ? [span(` ${String(model.percentage)}%`)] : [])
  ];
}

function progressModel(widget: Widget): ProgressModel {
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  const rawValue = numberProp(widget, 'value');
  const indeterminate = widget.props['indeterminate'] === true || rawValue === undefined;
  const value = Math.max(0, Math.min(max, rawValue ?? 0));
  const barWidth = boundedBarWidth(numberProp(widget, 'barWidth'));
  const percentage = max === 0 ? 0 : Math.round((value / max) * 100);
  return {
    label: sanitizeTerminalText(stringify(widget.props['label'])).text,
    mode: progressMode(widget.props['mode']),
    labelPosition: progressLabelPosition(widget.props['labelPosition']),
    status: activityStatus(widget.props['status'], 'running'),
    indeterminate,
    value,
    max,
    barWidth,
    filled: indeterminate ? 0 : Math.round((value / max) * barWidth),
    showPercentage: widget.props['showPercentage'] === true,
    percentage
  };
}

function boundedBarWidth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(120, Math.floor(value)));
}

function progressMode(value: unknown): ProgressBarMode {
  return value === 'compact' ? 'compact' : 'full';
}

function progressLabelPosition(value: unknown): ProgressBarLabelPosition {
  return value === 'end' || value === 'none' ? value : 'start';
}
