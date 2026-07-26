import type { RenderNodeOfKind } from '../model/index.ts';
import { fillTextCells, measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import { indeterminateProgressFrame } from '../../behavior/feedback.ts';
import type { ProcessStatus } from '../../ui-model/contracts.ts';
import type { ProgressBarLabelPosition, ProgressBarDisplay, ValueScaleStop } from '../../ui-model/feedback.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { block, line } from './frame.ts';
import { feedbackStatusMarkerSpan, feedbackStructureSpan, feedbackTextSpan } from './feedback-visual.ts';
import { stringify } from './render-node-props.ts';
import { measureRenderSpans } from '../../visual/render.ts';
import { normalizeValueScale, valueScaleStyle } from './value-scale.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './frame.ts';
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
  readonly valueScale: readonly ValueScaleStop[];
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
  renderNode: ProgressBarNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  maxCells?: number
): RenderBlock {
  const model = progressModel(renderNode);
  return block([line(fitProgressSpans(renderNode, model, theme, maxCells, widthProfile))]);
}

export function progressText(renderNode: ProgressBarNode, theme: TerminalTheme, widthProfile: TextWidthProfile): string {
  return progressBlock(renderNode, theme, widthProfile).lines.map((currentLine) => currentLine.spans.map((currentSpan) => currentSpan.text).join('')).join('\n');
}

export function progressAccessibleBase(renderNode: ProgressBarNode, id: string): AccessibleNode {
  const model = progressModel(renderNode);
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
  renderNode: ProgressBarNode,
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
    const spans = progressSpans(renderNode, model, theme, parts, maxCells, widthProfile);
    if (maxCells === undefined || measureRenderSpans(spans, { widthProfile }) <= maxCells) return spans;
  }
  return progressSpans(renderNode, model, theme, candidates.at(-1) ?? initialParts, maxCells, widthProfile);
}

function progressSpans(
  renderNode: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const barWidth = fittedBarWidth(renderNode, model, theme, parts, maxCells, widthProfile);
  return [
    ...progressStatusSpans(renderNode, model, theme),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'start' ? [feedbackTextSpan(renderNode, `${model.label} `, 'progressBar', 'label')] : []),
    feedbackStructureSpan(renderNode, '[', 'progressBar', 'frame.open', statusStyle('idle')),
    ...progressBarSpans(renderNode, model, theme, barWidth, widthProfile),
    feedbackStructureSpan(renderNode, ']', 'progressBar', 'frame.close', statusStyle('idle')),
    ...progressMetricSpans(renderNode, model, parts),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'end' ? [feedbackTextSpan(renderNode, ` ${model.label}`, 'progressBar', 'label')] : [])
  ];
}

function fittedBarWidth(
  renderNode: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  parts: ProgressParts,
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): number {
  if (maxCells === undefined) return model.barWidth;
  const withoutBar = [
    ...progressStatusSpans(renderNode, model, theme),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'start' ? [feedbackTextSpan(renderNode, `${model.label} `, 'progressBar', 'label')] : []),
    feedbackStructureSpan(renderNode, '[', 'progressBar', 'frame.open', statusStyle('idle')),
    feedbackStructureSpan(renderNode, ']', 'progressBar', 'frame.close', statusStyle('idle')),
    ...progressMetricSpans(renderNode, model, parts),
    ...(parts.label && model.label.length > 0 && model.labelPosition === 'end' ? [feedbackTextSpan(renderNode, ` ${model.label}`, 'progressBar', 'label')] : [])
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
  renderNode: ProgressBarNode,
  model: ProgressModel,
  theme: TerminalTheme,
  barWidth: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (model.indeterminate) {
    return indeterminateProgressSpans(renderNode, model, theme, barWidth, widthProfile);
  }
  const filledCells = Math.round((model.value / model.max) * barWidth);
  if (model.valueScale.length === 0) {
    return [
      feedbackStructureSpan(
        renderNode,
        fillTextCells(theme.tokens.symbols.progressFilled, filledCells, { widthProfile }),
        'progressBar',
        'filled',
        progressFillStyle(model.status)
      ),
      feedbackStructureSpan(
        renderNode,
        fillTextCells(theme.tokens.symbols.progressEmpty, barWidth - filledCells, { widthProfile }),
        'progressBar',
        'track',
        progressTrackStyle()
      )
    ];
  }
  return [
    ...scaledProgressFillSpans(renderNode, model, theme, filledCells, barWidth, widthProfile),
    feedbackStructureSpan(
      renderNode,
      fillTextCells(theme.tokens.symbols.progressEmpty, barWidth - filledCells, { widthProfile }),
      'progressBar',
      'track',
      progressTrackStyle()
    )
  ];
}

function indeterminateProgressSpans(
  renderNode: ProgressBarNode,
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
          renderNode,
          fillTextCells(theme.tokens.symbols.progressFilled, currentCells, { widthProfile }),
          'progressBar',
          'active',
          progressFillStyle(model.status)
        )
      : feedbackStructureSpan(
          renderNode,
          fillTextCells(theme.tokens.symbols.progressEmpty, currentCells, { widthProfile }),
          'progressBar',
          'track',
          progressTrackStyle()
        )];
  });
}

function scaledProgressFillSpans(
  renderNode: ProgressBarNode,
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
      renderNode,
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

function progressStatusSpans(renderNode: ProgressBarNode, model: ProgressModel, theme: TerminalTheme) {
  if (model.status === 'running') return [];
  return [
    feedbackStatusMarkerSpan(renderNode, 'progressBar', 'status.marker', model.status, statusMarker(model.status, theme)),
    feedbackStructureSpan(renderNode, ' ', 'progressBar', 'status.gap')
  ];
}

function progressMetricSpans(renderNode: ProgressBarNode, model: ProgressModel, parts: ProgressParts) {
  if (model.indeterminate) return parts.timing ? timingSpans(renderNode, model) : [];
  return [
    ...(parts.value ? [feedbackTextSpan(renderNode, ` ${String(model.value)}/${String(model.max)}`, 'progressBar', 'value')] : []),
    ...(parts.percentage ? [feedbackTextSpan(renderNode, ` ${String(model.percentage)}%`, 'progressBar', 'percentage')] : []),
    ...(parts.timing ? timingSpans(renderNode, model) : [])
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

function progressModel(renderNode: ProgressBarNode): ProgressModel {
  const mode = renderNode.props.mode;
  const indeterminate = mode.kind === 'indeterminate';
  const max = mode.kind === 'determinate' ? mode.max ?? 100 : 100;
  const value = mode.kind === 'determinate' ? Math.max(0, Math.min(max, mode.value)) : 0;
  const barWidth = renderNode.props.barWidth ?? 10;
  const percentage = max === 0 ? 0 : Math.round((value / max) * 100);
  return {
    label: sanitizeTerminalText(stringify(renderNode.props.label)).text,
    display: renderNode.props.display ?? 'bar+value',
    labelPosition: renderNode.props.labelPosition ?? 'start',
    status: renderNode.props.status ?? 'running',
    indeterminate,
    value,
    max,
    barWidth,
    percentage,
    frame: mode.kind === 'indeterminate' ? Math.floor(mode.frame ?? 0) : 0,
    valueScale: normalizeValueScale(renderNode.props.valueScale),
    ...(renderNode.props.elapsedMs === undefined ? {} : { elapsedMs: renderNode.props.elapsedMs }),
    ...(renderNode.props.remainingMs === undefined ? {} : { remainingMs: renderNode.props.remainingMs })
  };
}

function timingSpans(renderNode: ProgressBarNode, model: ProgressModel) {
  const text = timingText(model);
  return text.length === 0 ? [] : [feedbackTextSpan(renderNode, ` ${text}`, 'progressBar', 'timing')];
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

type ProgressBarNode = RenderNodeOfKind<unknown, 'progressBar'>;
