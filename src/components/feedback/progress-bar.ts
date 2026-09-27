import { indeterminateProgressFrame } from '../../behavior/progress.ts';
import type { ValueScaleStop } from '../../behavior/visualization-data.ts';
import type {
  ComponentRenderInput,
  SemanticLeafComponentFactory,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import {
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import { fillTextCells } from '../../text/cell-geometry.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { measureRenderSpans, span } from '../../visual/render-content.ts';
import {
  assertAccessibleLabel,
  assertProcessStatus,
  decodeValueScaleFor,
  processStatusMarker,
  processStatusStyle,
  progressScaleStyle,
  sanitizeLine,
  singleLineMeasurement,
} from '../shared/indicator-helpers.ts';
import type { ProgressBarStylePart } from '../style-parts.ts';
import type { ProgressBarOptions } from './options.ts';
import type { ProgressBarDisplay, ProgressBarLabelPosition, ProgressBarMode } from './progress.ts';
import type { ProcessStatus } from './status-bar-contracts.ts';


interface ProgressBarModel {
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
  readonly showLabel: boolean;
  readonly showValue: boolean;
  readonly showPercentage: boolean;
  readonly showTiming: boolean;
}

export const progressBar: SemanticLeafComponentFactory<
  Pick<
    ProgressBarOptions,
    | 'label'
    | 'mode'
    | 'barWidth'
    | 'display'
    | 'labelPosition'
    | 'elapsedMs'
    | 'remainingMs'
    | 'status'
    | 'valueScale'
  >,
  never,
  ProgressBarStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<Pick<
    ProgressBarOptions,
    | 'label'
    | 'mode'
    | 'barWidth'
    | 'display'
    | 'labelPosition'
    | 'elapsedMs'
    | 'remainingMs'
    | 'status'
    | 'valueScale'
  >>()({
  name: 'terminal-ui/components/progress-bar',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'progressbar',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value', 'track', 'fill'],
  createModel(value) {
    const label = value.label;
    const mode = value.mode;
    const display = value.display;
    const labelPosition = value.labelPosition;
    const status = value.status;
    assertAccessibleLabel(label, 'progressBar');
    assertProcessStatus(status, 'progressBar');
    assertOptionalEnum(
      display,
      ['bar', 'bar+percent', 'bar+value', 'bar+value+percent'],
      'progressBar display',
    );
    assertOptionalEnum(labelPosition, ['start', 'end', 'none'], 'progressBar labelPosition');
    const barWidth = normalizedProgressBarWidth(value.barWidth) ?? 10;
    const elapsedMs = normalizedDuration(value.elapsedMs, 'progressBar elapsedMs');
    const remainingMs = normalizedDuration(value.remainingMs, 'progressBar remainingMs');
    const normalizedMode = decodeProgressMode(mode);
    const max = normalizedMode.kind === 'determinate' ? normalizedMode.max ?? 100 : 100;
    const current = normalizedMode.kind === 'determinate'
      ? Math.max(0, Math.min(max, normalizedMode.value))
      : 0;
    return {
      label: sanitizeLine(label),
      display: display ?? 'bar+value',
      labelPosition: labelPosition ?? 'start',
      status: status ?? 'running',
      indeterminate: normalizedMode.kind === 'indeterminate',
      value: current,
      max,
      barWidth,
      percentage: max === 0 ? 0 : Math.round((current / max) * 100),
      frame: normalizedMode.kind === 'indeterminate' ? Math.floor(normalizedMode.frame ?? 0) : 0,
      valueScale: decodeValueScaleFor(value.valueScale, 'progressBar'),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...(remainingMs === undefined ? {} : { remainingMs }),
    };
  },
  measure(input) {
    return singleLineMeasurement(progressSpansFor(input, undefined, false), input.widthProfile);
  },
  render(input) {
    input.target.write(0, 0, progressSpansFor(input, input.bounds.width, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'progressbar',
      ...(model.label === '' ? {} : { label: model.label }),
      numericValue: model.indeterminate
        ? { indeterminate: true }
        : { current: model.value, minimum: 0, maximum: model.max },
      live: 'polite',
      ...progressDescription(model),
    };
  },
});

function decodeProgressMode(mode: ProgressBarMode): ProgressBarMode {
  if (!isNonArrayObject(mode) || !isStringMember(mode.kind, ['determinate', 'indeterminate'])) {
    throw new TypeError('progressBar mode must be determinate or indeterminate.');
  }
  if (mode.kind === 'indeterminate') {
    const frame = mode.frame;
    if (frame !== undefined && (typeof frame !== 'number' || !Number.isFinite(frame))) {
      throw new RangeError('progressBar indeterminate frame must be finite when provided.');
    }
    return { kind: mode.kind, ...(frame === undefined ? {} : { frame }) };
  }
  const { value, max } = mode;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError('progressBar determinate value must be finite.');
  }
  if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max) || max <= 0)) {
    throw new RangeError('progressBar determinate max must be finite and greater than zero.');
  }
  return { kind: mode.kind, value, ...(max === undefined ? {} : { max }) };
}

function normalizedProgressBarWidth(value: number | undefined): number | undefined {
  assertOptionalFiniteNumber(value, 'progressBar barWidth');
  if (value === undefined) return undefined;
  if (value <= 0) throw new RangeError('progressBar barWidth must be greater than zero.');
  return Math.max(1, Math.min(120, Math.floor(value)));
}

function normalizedDuration(value: number | undefined, label: string): number | undefined {
  assertOptionalFiniteNumber(value, label);
  if (value === undefined) return undefined;
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return Math.floor(value);
}

interface ProgressVisualInput {
  readonly model: ProgressBarModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  readonly style?: ComponentRenderInput<ProgressBarModel, ProgressBarStylePart>['style'];
  readonly frameSource?: ComponentRenderInput<ProgressBarModel, ProgressBarStylePart>['frameSource'];
}

function progressSpansFor(
  input: ProgressVisualInput,
  maxCells: number | undefined,
  decorated: boolean,
): readonly RenderSpan[] {
  if (maxCells !== undefined && maxCells <= 0) return [];
  const initial = progressParts(input.model);
  const candidates: readonly ProgressParts[] = [
    initial,
    { ...initial, showLabel: false },
    { ...initial, showLabel: false, showTiming: false },
    { ...initial, showLabel: false, showTiming: false, showValue: false },
    { ...initial, showLabel: false, showTiming: false, showValue: false, showPercentage: false },
  ];
  for (const parts of candidates) {
    const spans = progressSpans(input, parts, maxCells, decorated);
    if (
      maxCells === undefined ||
      measureRenderSpans(spans, { widthProfile: input.widthProfile }) <= maxCells
    ) return spans;
  }
  return progressSpans(input, candidates.at(-1) ?? initial, maxCells, decorated);
}

function progressSpans(
  input: ProgressVisualInput,
  parts: ProgressParts,
  maxCells: number | undefined,
  decorated: boolean,
): readonly RenderSpan[] {
  const barWidth = fittedProgressBarWidth(input, parts, maxCells, decorated);
  return [
    ...progressStatusSpans(input, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'start'
      ? [progressPartSpan(input, `${input.model.label} `, 'label', 'label', decorated)]
      : []),
    ...progressTrackSpans(input, barWidth, decorated),
    ...progressMetricSpans(input, parts, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'end'
      ? [progressPartSpan(input, ` ${input.model.label}`, 'label', 'label', decorated)]
      : []),
  ];
}

function fittedProgressBarWidth(
  input: ProgressVisualInput,
  parts: ProgressParts,
  maxCells: number | undefined,
  decorated: boolean,
): number {
  if (maxCells === undefined) return input.model.barWidth;
  const withoutBar = [
    ...progressStatusSpans(input, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'start'
      ? [progressPartSpan(input, `${input.model.label} `, 'label', 'label', decorated)]
      : []),
    ...progressMetricSpans(input, parts, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'end'
      ? [progressPartSpan(input, ` ${input.model.label}`, 'label', 'label', decorated)]
      : []),
  ];
  return Math.max(
    1,
    Math.min(
      input.model.barWidth,
      maxCells - measureRenderSpans(withoutBar, { widthProfile: input.widthProfile }),
    ),
  );
}

function progressParts(model: ProgressBarModel): ProgressParts {
  return {
    showLabel: model.labelPosition !== 'none',
    showValue: model.display === 'bar+value' || model.display === 'bar+value+percent',
    showPercentage: model.display === 'bar+percent' || model.display === 'bar+value+percent',
    showTiming: model.elapsedMs !== undefined || model.remainingMs !== undefined,
  };
}

function progressTrackSpans(
  input: ProgressVisualInput,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.indeterminate) return indeterminateProgressSpans(input, barWidth, decorated);
  const filledCells = Math.round((input.model.value / input.model.max) * barWidth);
  const filled = input.model.valueScale.length === 0
    ? [
      progressPartSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressFilled, filledCells, {
          widthProfile: input.widthProfile,
        }),
        'fill',
        'filled',
        decorated,
        progressFillStyle(input.model.status),
        'decoration',
      ),
    ]
    : scaledProgressFillSpans(input, filledCells, barWidth, decorated);
  return [
    ...filled,
    progressPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressEmpty, barWidth - filledCells, {
        widthProfile: input.widthProfile,
      }),
      'track',
      'track',
      decorated,
      progressTrackStyle(),
      'decoration',
    ),
  ];
}

function indeterminateProgressSpans(
  input: ProgressVisualInput,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const slotCells = Math.max(
    1,
    measureTextCells(input.theme.tokens.symbols.progressFilled, {
      widthProfile: input.widthProfile,
    }).cells,
    measureTextCells(input.theme.tokens.symbols.progressEmpty, { widthProfile: input.widthProfile })
      .cells,
  );
  const frame = indeterminateProgressFrame(
    input.model.frame,
    Math.max(1, Math.ceil(barWidth / slotCells)),
  );
  let remaining = barWidth;
  return frame.cells.flatMap((cell): readonly RenderSpan[] => {
    if (remaining === 0) return [];
    const cells = Math.min(slotCells, remaining);
    remaining -= cells;
    return [progressPartSpan(
      input,
      fillTextCells(
        cell.active
          ? input.theme.tokens.symbols.progressFilled
          : input.theme.tokens.symbols.progressEmpty,
        cells,
        { widthProfile: input.widthProfile },
      ),
      cell.active ? 'fill' : 'track',
      cell.active ? 'active' : 'track',
      decorated,
      cell.active ? progressFillStyle(input.model.status) : progressTrackStyle(),
      'decoration',
    )];
  });
}

function scaledProgressFillSpans(
  input: ProgressVisualInput,
  filledCells: number,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const glyphCells = Math.max(
    1,
    measureTextCells(input.theme.tokens.symbols.progressFilled, {
      widthProfile: input.widthProfile,
    }).cells,
  );
  const spans: RenderSpan[] = [];
  for (let usedCells = 0; usedCells < filledCells;) {
    const cells = Math.min(glyphCells, filledCells - usedCells);
    const value = ((usedCells + cells) / Math.max(1, barWidth)) * input.model.max;
    spans.push(progressPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressFilled, cells, {
        widthProfile: input.widthProfile,
      }),
      'fill',
      `segment.${String(spans.length)}.filled`,
      decorated,
      progressScaleStyle(
        value,
        input.model.max,
        input.model.valueScale,
        progressFillStyle(input.model.status),
      ),
      'decoration',
    ));
    usedCells += cells;
  }
  return spans;
}

function progressStatusSpans(
  input: ProgressVisualInput,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.status === 'running') return [];
  return [
    progressPartSpan(
      input,
      processStatusMarker(input.model.status, input.theme),
      'marker',
      'status.marker',
      decorated,
      processStatusStyle(input.model.status),
      'decoration',
    ),
    progressPartSpan(input, ' ', 'marker', 'status.gap', decorated, undefined, 'separator'),
  ];
}

function progressMetricSpans(
  input: ProgressVisualInput,
  parts: ProgressParts,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.indeterminate) {
    const timing = timingText(input.model);
    return parts.showTiming && timing.length > 0
      ? [progressPartSpan(input, ` ${timing}`, 'value', 'timing', decorated)]
      : [];
  }
  const timing = timingText(input.model);
  return [
    ...(parts.showValue
      ? [progressPartSpan(
        input,
        ` ${String(input.model.value)}/${String(input.model.max)}`,
        'value',
        'value',
        decorated,
      )]
      : []),
    ...(parts.showPercentage
      ? [progressPartSpan(
        input,
        ` ${String(input.model.percentage)}%`,
        'value',
        'percentage',
        decorated,
      )]
      : []),
    ...(parts.showTiming && timing.length > 0
      ? [progressPartSpan(input, ` ${timing}`, 'value', 'timing', decorated)]
      : []),
  ];
}

function progressPartSpan(
  input: ProgressVisualInput,
  textValue: string,
  part: ProgressBarStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = 'text',
): RenderSpan {
  if (!decorated || input.style === undefined || input.frameSource === undefined) return span(textValue);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({ cellRole, partName, partType: 'progress' }),
  });
}

function progressFillStyle(status: ProcessStatus): TerminalStyle {
  if (status === 'error' || status === 'warning' || status === 'success') {
    return processStatusStyle(status);
  }
  return { fg: { kind: 'theme', token: 'control.track.filled' }, bold: true };
}

function progressTrackStyle(): TerminalStyle {
  return { fg: { kind: 'theme', token: 'control.track' }, dim: true };
}

function progressDescription(model: ProgressBarModel): { readonly description?: string } {
  const textValue = timingText(model);
  return textValue.length === 0 ? {} : { description: textValue };
}

function timingText(model: ProgressBarModel): string {
  return [
    model.elapsedMs === undefined ? undefined : `${formatDuration(model.elapsedMs)} elapsed`,
    model.remainingMs === undefined ? undefined : `${formatDuration(model.remainingMs)} left`,
  ].filter((part): part is string => part !== undefined).join(' ');
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0
      ? `${String(minutes)}m`
      : `${String(minutes)}m${String(seconds).padStart(2, '0')}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h${String(remainingMinutes).padStart(2, '0')}m`;
}
