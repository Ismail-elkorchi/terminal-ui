import { sanitizeTerminalText } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { WidgetProcessStatus, ProgressBarLabelPosition, ProgressBarDisplay, Widget } from '../widgets/index.ts';
import { indeterminateProgressFrame } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { block, line } from './frame.ts';
import { feedbackStatusMarkerSpan, feedbackStructureSpan, feedbackTextSpan } from './feedback-visual.ts';
import { numberProp, stringify } from './widget-props.ts';
import { measureRenderSpans } from './render-primitives.ts';
import { normalizeValueScale, valueScaleStyle } from './value-scale.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './frame.ts';
import type { NormalizedValueScaleStop } from './value-scale.ts';

interface ProgressModel {
  readonly label: string;
  readonly display: ProgressBarDisplay;
  readonly labelPosition: ProgressBarLabelPosition;
  readonly status: WidgetProcessStatus;
  readonly indeterminate: boolean;
  readonly value: number;
  readonly max: number;
  readonly barWidth: number;
  readonly percentage: number;
  readonly frame: number;
  readonly valueScale: readonly NormalizedValueScaleStop[];
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
}

interface ProgressParts {
  readonly label: boolean;
  readonly value: boolean;
  readonly percentage: boolean;
  readonly timing: boolean;
}

export function progressBlock(widget: Widget, theme: TerminalTheme, maxCells?: number): RenderBlock {
  const model = progressModel(widget);
  return block([line(fitProgressSpans(widget, model, theme, maxCells))]);
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
      progress: { indeterminate: true },
      live: 'polite',
      ...progressDescription(model)
    };
  }
  return {
    id,
    role: 'progressbar',
    label: model.label || id,
    progress: { value: model.value, max: model.max },
    live: 'polite',
    ...progressDescription(model)
  };
}

function fitProgressSpans(widget: Widget, model: ProgressModel, theme: TerminalTheme, maxCells: number | undefined): readonly RenderSpan[] {
  if (maxCells !== undefined && maxCells <= 0) return [];
  const initialParts = progressParts(model);
  const candidates: readonly ProgressParts[] = [
    initialParts,
    { ...initialParts, label: false },
    { ...initialParts, label: false, timing: false },
    { ...initialParts, label: false, timing: false, value: false },
    { ...initialParts, label: false, timing: false, value: false, percentage: false }
  ];
  for (const parts of candidates) {
    const spans = progressSpans(widget, model, theme, parts, maxCells);
    if (maxCells === undefined || measureRenderSpans(spans) <= maxCells) return spans;
  }
  return progressSpans(widget, model, theme, candidates.at(-1) ?? initialParts, maxCells);
}

function progressSpans(
  widget: Widget,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined
): readonly RenderSpan[] {
  const barWidth = fittedBarWidth(widget, model, theme, parts, maxCells);
  return [
    ...progressStatusSpans(widget, model, theme),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'start' ? [feedbackTextSpan(widget, `${model.label} `, 'progressBar', 'label')] : []),
    feedbackStructureSpan(widget, '[', 'progressBar', 'chrome.open', statusStyle('idle')),
    ...progressBarSpans(widget, model, theme, barWidth),
    feedbackStructureSpan(widget, ']', 'progressBar', 'chrome.close', statusStyle('idle')),
    ...progressMetricSpans(widget, model, parts),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'end' ? [feedbackTextSpan(widget, ` ${model.label}`, 'progressBar', 'label')] : [])
  ];
}

function fittedBarWidth(
  widget: Widget,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined
): number {
  if (maxCells === undefined) return model.barWidth;
  const withoutBar = [
    ...progressStatusSpans(widget, model, theme),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'start' ? [feedbackTextSpan(widget, `${model.label} `, 'progressBar', 'label')] : []),
    feedbackStructureSpan(widget, '[', 'progressBar', 'chrome.open', statusStyle('idle')),
    feedbackStructureSpan(widget, ']', 'progressBar', 'chrome.close', statusStyle('idle')),
    ...progressMetricSpans(widget, model, parts),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'end' ? [feedbackTextSpan(widget, ` ${model.label}`, 'progressBar', 'label')] : [])
  ];
  return Math.max(1, Math.min(model.barWidth, maxCells - measureRenderSpans(withoutBar)));
}

function progressParts(model: ProgressModel): ProgressParts {
  return {
    label: model.labelPosition !== 'none',
    value: model.display === 'bar+value' || model.display === 'bar+value+percent',
    percentage: model.display === 'bar+percent' || model.display === 'bar+value+percent',
    timing: model.elapsedMs !== undefined || model.remainingMs !== undefined
  };
}

function progressBarSpans(widget: Widget, model: ProgressModel, theme: TerminalTheme, barWidth: number) {
  if (model.indeterminate) {
    return indeterminateProgressFrame(model.frame, barWidth).cells.map((cell) =>
      cell.active
        ? feedbackStructureSpan(widget, theme.tokens.symbols.progressFilled, 'progressBar', 'active', progressFillStyle(model.status))
        : feedbackStructureSpan(widget, theme.tokens.symbols.progressEmpty, 'progressBar', 'track', progressTrackStyle())
    );
  }
  const filled = Math.round((model.value / model.max) * barWidth);
  if (model.valueScale.length === 0) {
    return [
      feedbackStructureSpan(widget, theme.tokens.symbols.progressFilled.repeat(filled), 'progressBar', 'filled', progressFillStyle(model.status)),
      feedbackStructureSpan(widget, theme.tokens.symbols.progressEmpty.repeat(barWidth - filled), 'progressBar', 'track', progressTrackStyle())
    ];
  }
  return [
    ...Array.from({ length: filled }, (_, index) => {
      const segmentValue = ((index + 1) / Math.max(1, barWidth)) * model.max;
      return feedbackStructureSpan(
        widget,
        theme.tokens.symbols.progressFilled,
        'progressBar',
        `segment.${String(index)}.filled`,
        valueScaleStyle(segmentValue, { min: 0, max: model.max }, model.valueScale, progressFillStyle(model.status))
      );
    }),
    feedbackStructureSpan(widget, theme.tokens.symbols.progressEmpty.repeat(barWidth - filled), 'progressBar', 'track', progressTrackStyle())
  ];
}

function progressStatusSpans(widget: Widget, model: ProgressModel, theme: TerminalTheme) {
  if (model.status === 'running') return [];
  return [
    feedbackStatusMarkerSpan(widget, 'progressBar', 'status.marker', model.status, statusMarker(model.status, theme)),
    feedbackStructureSpan(widget, ' ', 'progressBar', 'status.gap')
  ];
}

function progressMetricSpans(widget: Widget, model: ProgressModel, parts: ProgressParts) {
  if (model.indeterminate) return parts.timing ? timingSpans(widget, model) : [];
  return [
    ...(parts.value ? [feedbackTextSpan(widget, ` ${String(model.value)}/${String(model.max)}`, 'progressBar', 'value')] : []),
    ...(parts.percentage ? [feedbackTextSpan(widget, ` ${String(model.percentage)}%`, 'progressBar', 'percentage')] : []),
    ...(parts.timing ? timingSpans(widget, model) : [])
  ];
}

function progressFillStyle(status: WidgetProcessStatus): TerminalStyle {
  if (status === 'error' || status === 'warning' || status === 'success') return statusStyle(status);
  return {
    fg: { kind: 'theme', token: 'control.track.filled' },
    bold: true
  };
}

function progressTrackStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'control.track' },
    dim: true
  };
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
    display: progressDisplay(widget.props['display']),
    labelPosition: progressLabelPosition(widget.props['labelPosition']),
    status: normalizeWidgetProcessStatus(widget.props['status'], 'running'),
    indeterminate,
    value,
    max,
    barWidth,
    percentage,
    frame: Math.floor(numberProp(widget, 'frame') ?? 0),
    valueScale: normalizeValueScale(widget.props['valueScale']),
    ...durationProp('elapsedMs', widget.props['elapsedMs']),
    ...durationProp('remainingMs', widget.props['remainingMs'])
  };
}

function timingSpans(widget: Widget, model: ProgressModel) {
  const text = timingText(model);
  return text.length === 0 ? [] : [feedbackTextSpan(widget, ` ${text}`, 'progressBar', 'timing')];
}

function progressDescription(model: ProgressModel): { readonly description?: string } {
  const text = timingText(model);
  return text.length === 0 ? {} : { description: text };
}

function timingText(model: ProgressModel): string {
  const parts = [
    model.elapsedMs === undefined ? undefined : `${formatDuration(model.elapsedMs)} elapsed`,
    model.remainingMs === undefined ? undefined : `${formatDuration(model.remainingMs)} left`
  ].filter((part): part is string => part !== undefined);
  return parts.join(' ');
}

function durationProp<TKey extends 'elapsedMs' | 'remainingMs'>(
  key: TKey,
  value: unknown
): Pick<ProgressModel, TKey> | Record<string, never> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? { [key]: Math.floor(value) } as Pick<ProgressModel, TKey>
    : {};
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${String(minutes)}m` : `${String(minutes)}m${String(seconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${String(hours)}h` : `${String(hours)}h${String(remainingMinutes).padStart(2, '0')}m`;
}

function boundedBarWidth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(120, Math.floor(value)));
}

function progressDisplay(value: unknown): ProgressBarDisplay {
  return value === 'bar'
    || value === 'bar+percent'
    || value === 'bar+value'
    || value === 'bar+value+percent'
    ? value
    : 'bar+value';
}

function progressLabelPosition(value: unknown): ProgressBarLabelPosition {
  return value === 'end' || value === 'none' ? value : 'start';
}
