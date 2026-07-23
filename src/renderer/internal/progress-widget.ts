import type { RenderNodeOfKind } from '../model/index.ts';
import { fillTextCells, measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import { indeterminateProgressFrame } from '../../behavior/feedback.ts';
import type { ProcessStatus } from '../../ui-model/contracts.ts';
import { normalizeProcessStatus } from '../../ui-model/status.ts';
import type { ProgressBarLabelPosition, ProgressBarDisplay } from '../../ui-model/feedback.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { block, line } from './frame.ts';
import { feedbackStatusMarkerSpan, feedbackStructureSpan, feedbackTextSpan } from './feedback-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { measureRenderSpans } from '../../visual/render.ts';
import { normalizeValueScale, valueScaleStyle } from './value-scale.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './frame.ts';
import type { NormalizedValueScaleStop } from './value-scale.ts';
import type { TextWidthProfile } from '../../text/index.ts';

interface ProgressModel {
  readonly label: string;
  readonly display: ProgressBarDisplay;
  readonly labelPosition: ProgressBarLabelPosition;
  readonly status: ProcessStatus;
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

export function progressBlock(
  widget: ProgressBarNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  maxCells?: number
): RenderBlock {
  const model = progressModel(widget);
  return block([line(fitProgressSpans(widget, model, theme, maxCells, widthProfile))]);
}

export function progressText(widget: ProgressBarNode, theme: TerminalTheme, widthProfile: TextWidthProfile): string {
  return progressBlock(widget, theme, widthProfile).lines.map((currentLine) => currentLine.spans.map((currentSpan) => currentSpan.text).join('')).join('\n');
}

export function progressAccessibleBase(widget: ProgressBarNode, id: string): AccessibleNode {
  const model = progressModel(widget);
  if (model.indeterminate) {
    return {
      id,
      role: 'progressbar',
      label: model.label || id,
      numericValue: { indeterminate: true },
      live: 'polite',
      ...progressDescription(model)
    };
  }
  return {
    id,
    role: 'progressbar',
    label: model.label || id,
    numericValue: { current: model.value, minimum: 0, maximum: model.max },
    live: 'polite',
    ...progressDescription(model)
  };
}

function fitProgressSpans(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
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
    const spans = progressSpans(widget, model, theme, parts, maxCells, widthProfile);
    if (maxCells === undefined || measureRenderSpans(spans, { widthProfile }) <= maxCells) return spans;
  }
  return progressSpans(widget, model, theme, candidates.at(-1) ?? initialParts, maxCells, widthProfile);
}

function progressSpans(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const barWidth = fittedBarWidth(widget, model, theme, parts, maxCells, widthProfile);
  return [
    ...progressStatusSpans(widget, model, theme),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'start' ? [feedbackTextSpan(widget, `${model.label} `, 'progressBar', 'label')] : []),
    feedbackStructureSpan(widget, '[', 'progressBar', 'chrome.open', statusStyle('idle')),
    ...progressBarSpans(widget, model, theme, barWidth, widthProfile),
    feedbackStructureSpan(widget, ']', 'progressBar', 'chrome.close', statusStyle('idle')),
    ...progressMetricSpans(widget, model, parts),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'end' ? [feedbackTextSpan(widget, ` ${model.label}`, 'progressBar', 'label')] : [])
  ];
}

function fittedBarWidth(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
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
  return Math.max(1, Math.min(model.barWidth, maxCells - measureRenderSpans(withoutBar, { widthProfile })));
}

function progressParts(model: ProgressModel): ProgressParts {
  return {
    label: model.labelPosition !== 'none',
    value: model.display === 'bar+value' || model.display === 'bar+value+percent',
    percentage: model.display === 'bar+percent' || model.display === 'bar+value+percent',
    timing: model.elapsedMs !== undefined || model.remainingMs !== undefined
  };
}

function progressBarSpans(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  barWidth: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (model.indeterminate) {
    return indeterminateProgressSpans(widget, model, theme, barWidth, widthProfile);
  }
  const filledCells = Math.round((model.value / model.max) * barWidth);
  if (model.valueScale.length === 0) {
    return [
      feedbackStructureSpan(
        widget,
        fillTextCells(theme.tokens.symbols.progressFilled, filledCells, { widthProfile }),
        'progressBar',
        'filled',
        progressFillStyle(model.status)
      ),
      feedbackStructureSpan(
        widget,
        fillTextCells(theme.tokens.symbols.progressEmpty, barWidth - filledCells, { widthProfile }),
        'progressBar',
        'track',
        progressTrackStyle()
      )
    ];
  }
  return [
    ...scaledProgressFillSpans(widget, model, theme, filledCells, barWidth, widthProfile),
    feedbackStructureSpan(
      widget,
      fillTextCells(theme.tokens.symbols.progressEmpty, barWidth - filledCells, { widthProfile }),
      'progressBar',
      'track',
      progressTrackStyle()
    )
  ];
}

function indeterminateProgressSpans(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  barWidth: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const slotCells = Math.max(
    1,
    measureTextCells(theme.tokens.symbols.progressFilled, { widthProfile }).cells,
    measureTextCells(theme.tokens.symbols.progressEmpty, { widthProfile }).cells
  );
  const frame = indeterminateProgressFrame(model.frame, Math.max(1, Math.ceil(barWidth / slotCells)));
  let remaining = barWidth;
  return frame.cells.flatMap((cell): readonly RenderSpan[] => {
    if (remaining === 0) return [];
    const currentCells = Math.min(slotCells, remaining);
    remaining -= currentCells;
    return [cell.active
      ? feedbackStructureSpan(
          widget,
          fillTextCells(theme.tokens.symbols.progressFilled, currentCells, { widthProfile }),
          'progressBar',
          'active',
          progressFillStyle(model.status)
        )
      : feedbackStructureSpan(
          widget,
          fillTextCells(theme.tokens.symbols.progressEmpty, currentCells, { widthProfile }),
          'progressBar',
          'track',
          progressTrackStyle()
        )];
  });
}

function scaledProgressFillSpans(
  widget: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  filledCells: number,
  barWidth: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const glyphCells = Math.max(
    1,
    measureTextCells(theme.tokens.symbols.progressFilled, { widthProfile }).cells
  );
  const spans: RenderSpan[] = [];
  let usedCells = 0;
  while (usedCells < filledCells) {
    const currentCells = Math.min(glyphCells, filledCells - usedCells);
    const segmentValue = ((usedCells + currentCells) / Math.max(1, barWidth)) * model.max;
    spans.push(feedbackStructureSpan(
      widget,
      fillTextCells(theme.tokens.symbols.progressFilled, currentCells, { widthProfile }),
      'progressBar',
      `segment.${String(spans.length)}.filled`,
      valueScaleStyle(
        segmentValue,
        { min: 0, max: model.max },
        model.valueScale,
        progressFillStyle(model.status)
      )
    ));
    usedCells += currentCells;
  }
  return spans;
}

function progressStatusSpans(widget: ProgressBarNode, model: ProgressModel, theme: TerminalTheme) {
  if (model.status === 'running') return [];
  return [
    feedbackStatusMarkerSpan(widget, 'progressBar', 'status.marker', model.status, statusMarker(model.status, theme)),
    feedbackStructureSpan(widget, ' ', 'progressBar', 'status.gap')
  ];
}

function progressMetricSpans(widget: ProgressBarNode, model: ProgressModel, parts: ProgressParts) {
  if (model.indeterminate) return parts.timing ? timingSpans(widget, model) : [];
  return [
    ...(parts.value ? [feedbackTextSpan(widget, ` ${String(model.value)}/${String(model.max)}`, 'progressBar', 'value')] : []),
    ...(parts.percentage ? [feedbackTextSpan(widget, ` ${String(model.percentage)}%`, 'progressBar', 'percentage')] : []),
    ...(parts.timing ? timingSpans(widget, model) : [])
  ];
}

function progressFillStyle(status: ProcessStatus): TerminalStyle {
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

function progressModel(widget: ProgressBarNode): ProgressModel {
  const mode = widget.props.mode;
  const indeterminate = mode.kind === 'indeterminate';
  const max = mode.kind === 'determinate' ? mode.max ?? 100 : 100;
  const value = mode.kind === 'determinate' ? Math.max(0, Math.min(max, mode.value)) : 0;
  const barWidth = boundedBarWidth(numberProp(widget, 'barWidth'));
  const percentage = max === 0 ? 0 : Math.round((value / max) * 100);
  return {
    label: sanitizeTerminalText(stringify(widget.props.label)).text,
    display: progressDisplay(widget.props.display),
    labelPosition: progressLabelPosition(widget.props.labelPosition),
    status: normalizeProcessStatus(widget.props.status, 'running'),
    indeterminate,
    value,
    max,
    barWidth,
    percentage,
    frame: mode.kind === 'indeterminate' ? Math.floor(mode.frame ?? 0) : 0,
    valueScale: normalizeValueScale(widget.props.valueScale),
    ...durationProp('elapsedMs', widget.props.elapsedMs),
    ...durationProp('remainingMs', widget.props.remainingMs)
  };
}

function timingSpans(widget: ProgressBarNode, model: ProgressModel) {
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
type ProgressBarNode = RenderNodeOfKind<unknown, 'progressBar'>;
