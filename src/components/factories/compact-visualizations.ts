import {
  defineComponent,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type { SemanticLeafComponentFactory } from '../../component/index.ts';
import type {
  MeterOptions,
  SparklineOptions,
} from '../options/feedback-and-visualizations.ts';
import type { ValueScaleStop } from '../../behavior/visualization-data.ts';
import type {
  MeterStylePart,
  SparklineStylePart,
} from '../style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { ComponentRenderInput } from '../../component/index.ts';
import {
  fillTextCells,
  measureTextCells,
  oneCellGlyph,
} from '../../text/index.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
} from '../../foundation/validation.ts';
import {
  assertAccessibleLabel,
  assertChartDataStatus,
  assertFiniteValues,
  assertMeterStatus,
  assertNumericDomain,
  assertPositiveSafeInteger,
  decodeValueScaleFor,
  processStatusMarker,
  processStatusStyle,
  progressScaleStyle,
  sanitizeLine,
  singleLineMeasurement,
} from './indicator-helpers.ts';

interface SparklineModel {
  readonly label: string;
  readonly values: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly dataStatus?: import('../../behavior/visualization-data.ts').ChartDataStatus;
  readonly valueScale: readonly ValueScaleStop[];
  readonly emptyText: string;
  readonly loadingText: string;
  readonly errorText: string;
}

export const sparkline: SemanticLeafComponentFactory<
  Pick<
    SparklineOptions,
    | 'label'
    | 'values'
    | 'min'
    | 'max'
    | 'dataStatus'
    | 'valueScale'
    | 'emptyText'
    | 'loadingText'
    | 'errorText'
  >,
  never,
  SparklineStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<
    SparklineOptions,
    | 'label'
    | 'values'
    | 'min'
    | 'max'
    | 'dataStatus'
    | 'valueScale'
    | 'emptyText'
    | 'loadingText'
    | 'errorText'
  >,
  SparklineModel,
  never,
  SparklineStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/sparkline',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  metadata: ['styles', 'layer'],
  parts: ['value', 'muted', 'series'],
  createModel(value) {
    const label = value.label;
    const values = value.values;
    assertAccessibleLabel(label, 'sparkline');
    assertFiniteValues(values, 'sparkline values');
    assertNumericDomain(value.min, value.max, 'sparkline');
    assertChartDataStatus(value.dataStatus, 'sparkline');
    const min = typeof value.min === 'number'
      ? value.min
      : values.length === 0
      ? 0
      : Math.min(...values);
    const candidateMax = typeof value.max === 'number'
      ? value.max
      : values.length === 0
      ? 1
      : Math.max(...values);
    return {
      label: sanitizeLine(label),
      values: [...values],
      min,
      max: candidateMax <= min ? min + 1 : candidateMax,
      ...(value.dataStatus === undefined ? {} : { dataStatus: value.dataStatus }),
      valueScale: decodeValueScaleFor(value.valueScale, 'sparkline'),
      emptyText: decodeOptionalLine(
        value.emptyText,
        'sparkline emptyText',
        'No sparkline data',
      ),
      loadingText: decodeOptionalLine(
        value.loadingText,
        'sparkline loadingText',
        'Loading data',
      ),
      errorText: decodeOptionalLine(
        value.errorText,
        'sparkline errorText',
        'Unable to render data',
      ),
    };
  },
  measure(input) {
    return singleLineMeasurement(sparklineSpans(input, false), input.widthProfile);
  },
  render(input) {
    input.target.write(0, 0, sparklineSpans(input, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'text',
      label: model.label,
      ...(model.values.length === 0 ? {} : { value: `${String(model.values.length)} points` }),
      description: `${String(model.values.length)} sparkline points.`,
    };
  },
});

interface SparklineVisualInput {
  readonly model: SparklineModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly style?: ComponentRenderInput<SparklineModel, SparklineStylePart>['style'];
  readonly frameSource?: ComponentRenderInput<SparklineModel, SparklineStylePart>['frameSource'];
}

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

function sparklineSpans(input: SparklineVisualInput, decorated: boolean): readonly RenderSpan[] {
  const message = input.model.dataStatus === 'loading'
    ? { kind: 'loading' as const, text: input.model.loadingText, status: 'running' as const }
    : input.model.dataStatus === 'error'
    ? { kind: 'error' as const, text: input.model.errorText, status: 'error' as const }
    : input.model.values.length === 0
    ? { kind: 'empty' as const, text: input.model.emptyText, status: 'idle' as const }
    : undefined;
  if (message !== undefined) {
    return [
      chartPartSpan(
        input,
        processStatusMarker(message.status, input.theme),
        'muted',
        `state.${message.kind}.marker`,
        decorated,
        processStatusStyle(message.status),
        'decoration',
      ),
      chartPartSpan(
        input,
        ' ',
        'muted',
        `state.${message.kind}.separator`,
        decorated,
        undefined,
        'separator',
      ),
      chartPartSpan(
        input,
        message.text,
        message.kind === 'error' ? 'value' : 'muted',
        `state.${message.kind}.message`,
        decorated,
        message.kind === 'error'
          ? processStatusStyle('error')
          : { fg: { kind: 'theme', token: 'chart.muted' }, dim: true },
        'text',
      ),
    ];
  }
  return input.model.values.map((value, index) => {
    const ratio = (value - input.model.min) / (input.model.max - input.model.min);
    const glyphIndex = Math.max(
      0,
      Math.min(sparkGlyphs.length - 1, Math.round(ratio * (sparkGlyphs.length - 1))),
    );
    const base: TerminalStyle = { fg: { kind: 'theme', token: 'chart.series.1' }, bold: true };
    return chartPartSpan(
      input,
      sparkGlyphs[glyphIndex] ?? sparkGlyphs[0],
      'series',
      `point.${String(index)}`,
      decorated,
      progressScaleStyle(
        value - input.model.min,
        input.model.max - input.model.min,
        input.model.valueScale,
        base,
      ),
      'chart',
    );
  });
}

function chartPartSpan<TModel extends object>(
  input: {
    readonly style?: ComponentRenderInput<TModel, SparklineStylePart>['style'];
    readonly frameSource?: ComponentRenderInput<TModel, SparklineStylePart>['frameSource'];
  },
  textValue: string,
  part: SparklineStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = 'chart',
): RenderSpan {
  if (!decorated || input.style === undefined || input.frameSource === undefined) return span(textValue);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole,
      partName,
      partType: 'chart',
      description: partName,
    }),
  });
}

function decodeOptionalLine(value: string | undefined, label: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const line = sanitizeLine(value).trim();
  return line.length === 0 ? fallback : line;
}

interface MeterModel {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly width: number;
  readonly variant: import('../../behavior/visualization-data.ts').MeterVariant;
  readonly status?: import('../../behavior/visualization-data.ts').MeterStatus;
}

export const meter: SemanticLeafComponentFactory<
  Pick<MeterOptions, 'label' | 'value' | 'min' | 'max' | 'width' | 'variant' | 'status'>,
  never,
  MeterStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<MeterOptions, 'label' | 'value' | 'min' | 'max' | 'width' | 'variant' | 'status'>,
  MeterModel,
  never,
  MeterStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/meter',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'meter',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value', 'track', 'fill'],
  createModel(value) {
    const label = value.label;
    const current = value.value;
    const min = value.min;
    const max = value.max;
    const width = value.width;
    const variant = value.variant;
    const status = value.status;
    assertAccessibleLabel(label, 'meter');
    assertFiniteNumber(current, 'meter value');
    assertNumericDomain(min, max, 'meter');
    assertPositiveSafeInteger(width, 'meter width');
    assertMeterStatus(status);
    assertOptionalEnum(variant, ['linear', 'dial'], 'meter variant');
    const minimum = typeof min === 'number' ? min : 0;
    const maximum = Math.max(minimum + 1, typeof max === 'number' ? max : 100);
    return {
      label: sanitizeLine(label),
      value: current,
      min: minimum,
      max: maximum,
      width: typeof width === 'number' ? Math.max(4, Math.min(40, Math.floor(width))) : 12,
      variant: variant ?? 'linear',
      ...(status === undefined ? {} : { status }),
    };
  },
  measure(input) {
    const lines = meterLines(input, false);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(
        0,
        ...lines.map((current) =>
          measureRenderSpans(current, {
            widthProfile: input.widthProfile,
          })
        ),
      ),
      preferredHeight: lines.length,
    };
  },
  render(input) {
    input.target.writeBlock(0, 0, {
      lines: meterLines(input, true).map((spans) => ({ spans })),
    });
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'meter',
      ...(model.label === '' ? {} : { label: model.label }),
      value: model.value,
      numericValue: { current: model.value, minimum: model.min, maximum: model.max },
      description: `Meter from ${String(model.min)} to ${String(model.max)}.`,
    };
  },
});

interface MeterVisualInput {
  readonly model: MeterModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  readonly style?: ComponentRenderInput<MeterModel, MeterStylePart>['style'];
  readonly frameSource?: ComponentRenderInput<MeterModel, MeterStylePart>['frameSource'];
}

function meterLines(
  input: MeterVisualInput,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const ratio = Math.max(
    0,
    Math.min(1, (input.model.value - input.model.min) / (input.model.max - input.model.min)),
  );
  return input.model.variant === 'dial'
    ? meterDialLines(input, ratio, decorated)
    : [meterLinearSpans(input, ratio, decorated)];
}

function meterLinearSpans(
  input: MeterVisualInput,
  ratio: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const filled = Math.round(ratio * input.model.width);
  const statusStyle = meterStatusStyle(input.model.status);
  return [
    meterPartSpan(input, input.model.label, 'label', 'metric.label', decorated),
    meterPartSpan(
      input,
      ' ',
      'track',
      'metric.separator.afterLabel',
      decorated,
      undefined,
      'separator',
    ),
    meterPartSpan(input, '[', 'track', 'metric.bar.open', decorated, undefined, 'decoration'),
    meterPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressFilled, filled, {
        widthProfile: input.widthProfile,
      }),
      'fill',
      'metric.bar.filled',
      decorated,
      statusStyle,
      'decoration',
    ),
    meterPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressEmpty, input.model.width - filled, {
        widthProfile: input.widthProfile,
      }),
      'track',
      'metric.bar.empty',
      decorated,
      undefined,
      'decoration',
    ),
    meterPartSpan(input, ']', 'track', 'metric.bar.close', decorated, undefined, 'decoration'),
    meterPartSpan(
      input,
      ' ',
      'track',
      'metric.separator.beforeValue',
      decorated,
      undefined,
      'separator',
    ),
    meterPartSpan(
      input,
      `${String(Math.round(ratio * 100))}%`,
      'value',
      'metric.value',
      decorated,
      statusStyle,
    ),
    ...(input.model.status === undefined ? [] : [
      meterPartSpan(input, ' ', 'track', 'status.separator', decorated, undefined, 'separator'),
      meterPartSpan(input, input.model.status, 'value', 'status.value', decorated, statusStyle),
    ]),
  ];
}

function meterDialLines(
  input: MeterVisualInput,
  ratio: number,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const filled = Math.round(ratio * input.model.width);
  const statusStyle = meterStatusStyle(input.model.status);
  const marker = '▲';
  const markerWidth = measureTextCells(marker, { widthProfile: input.widthProfile }).cells;
  const markerColumn = Math.max(
    0,
    Math.min(
      input.model.width - markerWidth,
      Math.round(ratio * Math.max(0, input.model.width - markerWidth)),
    ),
  );
  return [
    [meterPartSpan(input, input.model.label, 'label', 'dial.label', decorated)],
    [
      meterPartSpan(
        input,
        oneCellGlyph('╭', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.open',
        decorated,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', filled, { widthProfile: input.widthProfile }),
        'fill',
        'dial.filled',
        decorated,
        statusStyle,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', input.model.width - filled, { widthProfile: input.widthProfile }),
        'track',
        'dial.empty',
        decorated,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('╮', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.close',
        decorated,
      ),
    ],
    [
      meterPartSpan(
        input,
        oneCellGlyph('│', '|', { widthProfile: input.widthProfile }),
        'track',
        'dial.side.left',
        decorated,
      ),
      meterPartSpan(
        input,
        `${' '.repeat(markerColumn)}${marker}${
          ' '.repeat(
            Math.max(0, input.model.width - markerColumn - markerWidth),
          )
        }`,
        'marker',
        'dial.needle',
        decorated,
        statusStyle,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('│', '|', { widthProfile: input.widthProfile }),
        'track',
        'dial.side.right',
        decorated,
      ),
      meterPartSpan(
        input,
        ' ',
        'track',
        'dial.separator.beforeValue',
        decorated,
        undefined,
        'separator',
      ),
      meterPartSpan(input, `${String(Math.round(ratio * 100))}%`, 'value', 'dial.value', decorated),
    ],
    [
      meterPartSpan(
        input,
        oneCellGlyph('╰', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.open',
        decorated,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', input.model.width, { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.edge',
        decorated,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('╯', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.close',
        decorated,
      ),
    ],
  ];
}

function meterPartSpan(
  input: MeterVisualInput,
  textValue: string,
  part: MeterStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = 'chart',
): RenderSpan {
  if (!decorated || input.style === undefined || input.frameSource === undefined) return span(textValue);
  const defaultBase = part === 'track'
    ? { fg: { kind: 'theme' as const, token: 'chart.muted' as const }, dim: true }
    : part === 'fill'
    ? { fg: { kind: 'theme' as const, token: 'chart.series.1' as const }, bold: true }
    : undefined;
  const resolvedBase = base ?? defaultBase;
  const style = input.style({
    part,
    ...(resolvedBase === undefined ? {} : { base: resolvedBase }),
  });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole,
      partName,
      partType: partName === 'metric.value' || partName === 'dial.value'
        ? 'metric'
        : partName === 'status.value'
        ? 'status'
        : 'meter',
      description: partName,
    }),
  });
}

function meterStatusStyle(status: MeterModel['status']): TerminalStyle {
  return status === undefined
    ? { fg: { kind: 'theme', token: 'chart.series.1' }, bold: true }
    : processStatusStyle(status);
}
