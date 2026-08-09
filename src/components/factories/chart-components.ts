import { defineComponent, ignoreMessage, span } from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  Element,
} from '../../component/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { createLocalCanvas2D, drawAreaSeries, drawLineSeries } from '../../renderer/index.ts';
import {
  fillTextCells,
  measureTextCells,
  oneCellGlyph,
  sanitizeTerminalText,
} from '../../text/index.ts';
import type {
  ChartDataState,
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeriesKind,
  ValueScaleStop,
} from '../../ui-model/feedback.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import type { ChartStylePart } from '../../ui-model/style-parts.ts';
import { isThemeColorToken } from '../../visual/index.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { BarChartOptions, ChartOptions, HeatmapOptions } from '../options/feedback.ts';

interface ChartStatus {
  readonly dataState?: ChartDataState;
  readonly empty: boolean;
  readonly emptyText: string;
  readonly loadingText: string;
  readonly errorText: string;
}

interface PreparedBar {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly value: number;
}

interface BarChartModel extends ChartStatus {
  readonly label: string;
  readonly items: readonly PreparedBar[];
  readonly maximum: number;
  readonly selectedId?: string;
  readonly pointerState?: PointerInteractionState;
}

interface DynamicBarChartOptions {
  readonly label: unknown;
  readonly items: unknown;
  readonly max?: unknown;
  readonly selectedId?: unknown;
  readonly dataState?: unknown;
  readonly emptyText?: unknown;
  readonly loadingText?: unknown;
  readonly errorText?: unknown;
  readonly pointerState?: unknown;
}

const barChartBase = {
  name: 'terminal-ui/components/bar-chart' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  optionFields: {
    label: null,
    items: null,
    max: null,
    selectedId: null,
    dataState: null,
    emptyText: null,
    loadingText: null,
    errorText: null,
    pointerState: null,
  },
  states: ['disabled'] as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted'] as const,
  prepare: prepareBarChart,
  measure: measureBarChart,
  render: paintBarChart,
  accessibility: barChartAccessibility,
};

const passiveBarChart = defineComponent<
  DynamicBarChartOptions,
  BarChartModel,
  never,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>(barChartBase);

const activeBarChart = defineComponent<
  DynamicBarChartOptions,
  BarChartModel,
  BarChartAction,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...barChartBase,
  keys: ({ model }) => {
    const selected = selectedBar(model);
    return {
      arrowUp: () => ({ kind: 'move', delta: -1 }),
      arrowDown: () => ({ kind: 'move', delta: 1 }),
      home: () => ({ kind: 'first' }),
      end: () => ({ kind: 'last' }),
      ...(selected === undefined ? {} : {
        enter: (): BarChartAction => ({
          kind: 'activate',
          id: selected.id,
          itemIndex: selected.itemIndex,
        }),
      }),
    };
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: () => ignoreMessage(),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    const plan = barChartPlan(input.model, input.bounds.height);
    return plan.items.map((item, row) => ({
      id: `${input.id ?? 'bar-chart'}:bar:${item.id}`,
      bounds: { row, column: 0, width: input.bounds.width, height: 1 },
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: (event: { readonly clickCount: number }): BarChartAction =>
        event.clickCount === 2
          ? { kind: 'activate', id: item.id, itemIndex: item.itemIndex }
          : { kind: 'select', id: item.id, itemIndex: item.itemIndex },
    }));
  },
});

export function barChart<const TMessage extends ComponentMessage = never>(
  options: BarChartOptions<TMessage>,
): Element<TMessage> {
  const own = snapshotBarOptions(options);
  if (options.onAction === undefined) {
    return passiveBarChart({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  return activeBarChart({
    ...own,
    id: options.id,
    onAction: options.onAction,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
}

function snapshotBarOptions(options: BarChartOptions<ComponentMessage>): DynamicBarChartOptions {
  return { ...options };
}

function prepareBarChart(value: unknown): BarChartModel {
  if (!isNonArrayObject(value)) throw new TypeError('barChart options must be an object.');
  const label = nonEmpty(value['label'], 'barChart label');
  if (!Array.isArray(value['items'])) throw new TypeError('barChart items must be an array.');
  const ids = new Set<string>();
  const items = Object.freeze(value['items'].map((candidate, itemIndex): PreparedBar => {
    if (!isNonArrayObject(candidate)) {
      throw new TypeError(`barChart items[${String(itemIndex)}] must be an object.`);
    }
    exact(candidate, ['id', 'label', 'value'], `barChart items[${String(itemIndex)}]`);
    const id = nonEmpty(candidate['id'], 'barChart item id');
    if (ids.has(id)) throw new TypeError(`barChart contains duplicate item id "${id}".`);
    ids.add(id);
    return Object.freeze({
      id,
      itemIndex,
      label: nonEmpty(candidate['label'], 'barChart item label'),
      value: finite(candidate['value'], 'barChart item value'),
    });
  }));
  const explicitMaximum = optionalFinite(value['max'], 'barChart max');
  const maximum = explicitMaximum ?? Math.max(1, ...items.map((item) => item.value));
  if (maximum <= 0) throw new RangeError('barChart max must be positive.');
  const selectedId = value['selectedId'] === undefined
    ? undefined
    : nonEmpty(value['selectedId'], 'barChart selectedId');
  const pointerState = preparePointerState(value['pointerState'], 'barChart');
  return {
    label,
    items,
    maximum,
    ...(selectedId === undefined ? {} : { selectedId }),
    ...prepareStatus(value, 'barChart', items.length === 0),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function measureBarChart(input: ComponentMeasureInput<BarChartModel>) {
  const longest = Math.max(
    0,
    ...input.model.items.map((item) =>
      measureTextCells(`${item.label}  ${String(item.value)}`, {
        widthProfile: input.widthProfile,
      }).cells + 4
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: Math.min(120, Math.max(1, longest)),
    preferredHeight: Math.min(24, Math.max(1, input.model.items.length)),
  };
}

function paintBarChart(input: ComponentRenderInput<BarChartModel, ChartStylePart>): void {
  if (paintStatus(input, input.model)) return;
  const plan = barChartPlan(input.model, input.bounds.height);
  for (const [row, item] of plan.items.entries()) {
    const selected = item.id === input.model.selectedId;
    const prefix = selected
      ? input.theme.tokens.symbols.pointer
      : input.theme.tokens.symbols.unselected;
    const value = String(item.value);
    const fixedCells = measureTextCells(`${prefix} ${item.label}  ${value}`, {
      widthProfile: input.widthProfile,
    }).cells;
    const available = Math.max(0, input.bounds.width - fixedCells);
    const fill = Math.max(
      0,
      Math.min(
        available,
        Math.round((item.value / input.model.maximum) * available),
      ),
    );
    const selection = selected ? selectedStyle() : undefined;
    input.target.write(row, 0, [
      chartSpan(
        input,
        prefix,
        'muted',
        `bar.${item.id}.marker`,
        'marker',
        selection,
        undefined,
        selected ? 'selected' : undefined,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeLabel`, 'separator'),
      chartSpan(
        input,
        item.label,
        'label',
        `bar.${item.id}.label`,
        'label',
        selection,
        undefined,
        selected ? 'selected' : undefined,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeFill`, 'separator'),
      chartSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressFilled, fill, {
          widthProfile: input.widthProfile,
        }),
        'series',
        `bar.${item.id}.fill`,
        'bar',
        selection ?? seriesStyle(item.itemIndex),
        item.itemIndex,
        selected ? 'selected' : undefined,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeValue`, 'separator'),
      chartSpan(
        input,
        value,
        'value',
        `bar.${item.id}.value`,
        'metric',
        selection,
        undefined,
        selected ? 'selected' : undefined,
      ),
    ]);
  }
}

function barChartAccessibility(input: ComponentAccessibilityInput<BarChartModel>) {
  const plan = barChartPlan(input.model, input.bounds.height);
  return {
    id: input.id,
    role: 'listbox' as const,
    label: input.model.label,
    description: `${String(input.model.items.length)} bars. Showing ${String(plan.start + 1)}-${
      String(plan.end)
    }.`,
    disabled: input.disabled,
    ...(input.focused ? { focused: true } : {}),
    children: plan.items.map((item) => ({
      id: `${input.id}:${item.id}`,
      role: 'option' as const,
      label: item.label,
      value: item.value,
      selected: item.id === input.model.selectedId,
      position: { positionInSet: item.itemIndex + 1, setSize: input.model.items.length },
    })),
  };
}

function selectedBar(model: BarChartModel): PreparedBar | undefined {
  return model.items.find((item) => item.id === model.selectedId);
}

function barChartPlan(model: BarChartModel, height: number) {
  const selected = model.items.findIndex((item) => item.id === model.selectedId);
  const window = visibleWindow(model.items.length, height, Math.max(0, selected));
  return {
    ...window,
    items: model.items.slice(window.start, window.end),
  };
}

interface PreparedPoint {
  readonly id: string;
  readonly pointIndex: number;
  readonly label: string;
  readonly value: number;
}

interface PreparedSeries {
  readonly id: string;
  readonly seriesIndex: number;
  readonly label: string;
  readonly points: readonly PreparedPoint[];
  readonly kind: ChartSeriesKind;
  readonly glyph?: string;
  readonly valueScale: readonly ValueScaleStop[];
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
}

interface ChartModel extends ChartStatus {
  readonly label: string;
  readonly series: readonly PreparedSeries[];
  readonly minimum: number;
  readonly maximum: number;
  readonly selected?: { readonly seriesId: string; readonly pointId: string };
  readonly legend: boolean;
  readonly signedDomain: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly valueScale: readonly ValueScaleStop[];
  readonly sampleMode: ChartSampleMode;
  readonly sampleAlign: ChartSampleAlign;
  readonly interpolation: ChartInterpolation;
  readonly pointerState?: PointerInteractionState;
}

interface DynamicChartOptions {
  readonly label: unknown;
  readonly series: unknown;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly selected?: unknown;
  readonly legend?: unknown;
  readonly signedDomain?: unknown;
  readonly xLabel?: unknown;
  readonly yLabel?: unknown;
  readonly dataState?: unknown;
  readonly valueScale?: unknown;
  readonly sampleMode?: unknown;
  readonly sampleAlign?: unknown;
  readonly interpolation?: unknown;
  readonly emptyText?: unknown;
  readonly loadingText?: unknown;
  readonly errorText?: unknown;
  readonly pointerState?: unknown;
}

const chartBase = {
  name: 'terminal-ui/components/chart' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  optionFields: {
    label: null,
    series: null,
    min: null,
    max: null,
    selected: null,
    legend: null,
    signedDomain: null,
    xLabel: null,
    yLabel: null,
    dataState: null,
    valueScale: null,
    sampleMode: null,
    sampleAlign: null,
    interpolation: null,
    emptyText: null,
    loadingText: null,
    errorText: null,
    pointerState: null,
  },
  states: ['disabled'] as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted', 'baseline'] as const,
  prepare: prepareChart,
  measure: measureChart,
  render: paintChart,
  accessibility: chartAccessibility,
};

const passiveChart = defineComponent<
  DynamicChartOptions,
  ChartModel,
  never,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>(chartBase);

const activeChart = defineComponent<
  DynamicChartOptions,
  ChartModel,
  ChartAction,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...chartBase,
  keys: ({ model }) => ({
    arrowLeft: () => ({ kind: 'movePoint', delta: -1 }),
    arrowRight: () => ({ kind: 'movePoint', delta: 1 }),
    arrowUp: () => ({ kind: 'moveSeries', delta: -1 }),
    arrowDown: () => ({ kind: 'moveSeries', delta: 1 }),
    pageUp: () => ({ kind: 'pagePoints', delta: -1 }),
    pageDown: () => ({ kind: 'pagePoints', delta: 1 }),
    home: () => ({ kind: 'firstPoint' }),
    end: () => ({ kind: 'lastPoint' }),
    ...(model.selected === undefined ? {} : {
      enter: (): ChartAction => ({
        kind: 'select',
        seriesId: model.selected?.seriesId ?? '',
        pointId: model.selected?.pointId ?? '',
      }),
    }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: () => ignoreMessage(),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: chartHitTargets,
});

export function chart<const TMessage extends ComponentMessage = never>(
  options: ChartOptions<TMessage>,
): Element<TMessage> {
  const own = snapshotChartOptions(options);
  if (options.onAction === undefined) {
    return passiveChart({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  return activeChart({
    ...own,
    id: options.id,
    onAction: options.onAction,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
}

function snapshotChartOptions(options: ChartOptions<ComponentMessage>): DynamicChartOptions {
  return { ...options };
}

function prepareChart(value: unknown): ChartModel {
  if (!isNonArrayObject(value)) throw new TypeError('chart options must be an object.');
  if (!Array.isArray(value['series'])) throw new TypeError('chart series must be an array.');
  const label = nonEmpty(value['label'], 'chart label');
  const seriesIds = new Set<string>();
  const values: number[] = [];
  const series = Object.freeze(value['series'].map((candidate, seriesIndex): PreparedSeries => {
    if (!isNonArrayObject(candidate) || !Array.isArray(candidate['points'])) {
      throw new TypeError(`chart series[${String(seriesIndex)}] is invalid.`);
    }
    exact(
      candidate,
      [
        'id',
        'label',
        'points',
        'kind',
        'glyph',
        'valueScale',
        'sampleMode',
        'sampleAlign',
        'interpolation',
      ],
      `chart series[${String(seriesIndex)}]`,
    );
    const id = nonEmpty(candidate['id'], 'chart series id');
    if (seriesIds.has(id)) throw new TypeError(`chart contains duplicate series id "${id}".`);
    seriesIds.add(id);
    const pointIds = new Set<string>();
    const points = Object.freeze(candidate['points'].map((raw, pointIndex): PreparedPoint => {
      if (!isNonArrayObject(raw)) throw new TypeError('chart point must be an object.');
      exact(raw, ['id', 'label', 'value'], `chart series "${id}" point`);
      const pointId = nonEmpty(raw['id'], 'chart point id');
      if (pointIds.has(pointId)) {
        throw new TypeError(`chart series "${id}" contains duplicate point id "${pointId}".`);
      }
      pointIds.add(pointId);
      const pointValue = finite(raw['value'], 'chart point value');
      values.push(pointValue);
      return Object.freeze({
        id: pointId,
        pointIndex,
        label: nonEmpty(raw['label'], 'chart point label'),
        value: pointValue,
      });
    }));
    return Object.freeze({
      id,
      seriesIndex,
      label: nonEmpty(candidate['label'], 'chart series label'),
      points,
      kind:
        optionalEnum(candidate['kind'], ['line', 'scatter', 'area', 'bar'], 'chart series kind') ??
          'line',
      ...optionalPreparedGlyph(candidate['glyph'], 'chart series glyph'),
      valueScale: prepareValueScale(candidate['valueScale'], 'chart series valueScale'),
      ...optionalProperty(
        'sampleMode',
        optionalEnum(
          candidate['sampleMode'],
          ['one-per-column', 'fit', 'window'],
          'chart series sampleMode',
        ),
      ),
      ...optionalProperty(
        'sampleAlign',
        optionalEnum(
          candidate['sampleAlign'],
          ['start', 'end'],
          'chart series sampleAlign',
        ),
      ),
      ...optionalProperty(
        'interpolation',
        optionalEnum(
          candidate['interpolation'],
          ['nearest', 'linear'],
          'chart series interpolation',
        ),
      ),
    });
  }));
  const range = numericRange(values, value['min'], value['max'], 'chart');
  const selected = prepareChartSelection(value['selected']);
  const pointerState = preparePointerState(value['pointerState'], 'chart');
  const xLabel = optionalText(value['xLabel'], 'chart xLabel');
  const yLabel = optionalText(value['yLabel'], 'chart yLabel');
  return {
    label,
    series,
    minimum: range.min,
    maximum: range.max,
    ...(selected === undefined ? {} : { selected }),
    legend: optionalBoolean(value['legend'], 'chart legend') ?? false,
    signedDomain: optionalBoolean(value['signedDomain'], 'chart signedDomain') ?? false,
    ...(xLabel === undefined ? {} : { xLabel }),
    ...(yLabel === undefined ? {} : { yLabel }),
    valueScale: prepareValueScale(value['valueScale'], 'chart valueScale'),
    sampleMode: optionalEnum(
      value['sampleMode'],
      ['one-per-column', 'fit', 'window'],
      'chart sampleMode',
    ) ?? 'one-per-column',
    sampleAlign: optionalEnum(value['sampleAlign'], ['start', 'end'], 'chart sampleAlign') ??
      'start',
    interpolation: optionalEnum(
      value['interpolation'],
      ['nearest', 'linear'],
      'chart interpolation',
    ) ?? 'nearest',
    ...prepareStatus(value, 'chart', values.length === 0),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function measureChart(input: ComponentMeasureInput<ChartModel>) {
  const widestSeries = Math.max(1, ...input.model.series.map((series) => series.points.length));
  const legendWidth = input.model.legend
    ? measureTextCells(
      input.model.series.map((series) =>
        `${seriesGlyph(series, input.widthProfile)} ${series.label}`
      ).join('  '),
      {
        widthProfile: input.widthProfile,
      },
    ).cells
    : 0;
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: Math.min(160, Math.max(widestSeries, legendWidth)),
    preferredHeight: Math.min(
      40,
      Math.max(
        1,
        8 + Number(input.model.legend) + Number(input.model.xLabel !== undefined) +
          Number(input.model.yLabel !== undefined),
      ),
    ),
  };
}

function paintChart(input: ComponentRenderInput<ChartModel, ChartStylePart>): void {
  if (paintStatus(input, input.model)) return;
  const layout = chartLayout(input.model, input.bounds.width, input.bounds.height);
  paintChartLabels(input, layout);
  if (layout.plotWidth <= 0 || layout.plotHeight <= 0) return;
  const canvas = createLocalCanvas2D(input.target, {
    row: layout.plotRow,
    column: 0,
    width: layout.plotWidth,
    height: layout.plotHeight,
  });
  const range = { min: input.model.minimum, max: input.model.maximum };
  if (input.model.signedDomain && range.min < 0 && range.max > 0) {
    const row = yForValue(0, range, layout.plotHeight);
    canvas.line(
      0,
      row,
      Math.max(0, layout.plotWidth - 1),
      row,
      chartSpan(
        input,
        oneCellGlyph('─', '-', { widthProfile: input.widthProfile }),
        'baseline',
        'baseline.zero',
        'baseline',
        { fg: { kind: 'theme', token: 'chart.baseline' }, dim: true },
      ),
    );
  }
  for (const series of input.model.series) {
    paintChartSeries(input, canvas, series, layout.plotHeight);
  }
  const selected = selectedChartPoint(input.model);
  if (selected === undefined) return;
  const projected = projectedSelection(
    input.model,
    selected.series,
    layout.plotWidth,
    selected.point.pointIndex,
  );
  if (projected === undefined) return;
  canvas.point(
    projected.column,
    yForValue(projected.value, range, layout.plotHeight),
    chartSpan(
      input,
      oneCellGlyph('◆', '*', { widthProfile: input.widthProfile }),
      'series',
      `selection.${selected.series.id}.${selected.point.id}`,
      'selected',
      selectedStyle(),
      selected.point.pointIndex,
    ),
  );
}

function paintChartLabels(
  input: ComponentRenderInput<ChartModel, ChartStylePart>,
  layout: ChartLayout,
): void {
  let row = 0;
  if (input.model.legend) {
    const spans = input.model.series.flatMap((series, index): readonly RenderSpan[] => [
      ...(index === 0 ? [] : [
        chartSpan(input, '  ', 'muted', `legend.${series.id}.separator.beforeGlyph`, 'separator'),
      ]),
      chartSpan(
        input,
        seriesGlyph(series, input.widthProfile),
        'legend',
        `legend.${series.id}.glyph`,
        'legend',
        seriesStyle(series.seriesIndex),
      ),
      chartSpan(input, ' ', 'muted', `legend.${series.id}.separator.beforeLabel`, 'separator'),
      chartSpan(input, series.label, 'label', `legend.${series.id}.label`, 'legend'),
    ]);
    input.target.write(row, 0, spans);
    row += 1;
  }
  if (input.model.yLabel !== undefined) {
    input.target.write(row, 0, [chartSpan(
      input,
      input.model.yLabel,
      'axis',
      'axis.y.label',
      'axis',
      { fg: { kind: 'theme', token: 'chart.axis' }, dim: true },
    )]);
  }
  if (input.model.xLabel !== undefined && layout.footerRow !== undefined) {
    input.target.write(layout.footerRow, 0, [chartSpan(
      input,
      input.model.xLabel,
      'axis',
      'axis.x.label',
      'axis',
      { fg: { kind: 'theme', token: 'chart.axis' }, dim: true },
    )]);
  }
}

function paintChartSeries(
  input: ComponentRenderInput<ChartModel, ChartStylePart>,
  canvas: ReturnType<typeof createLocalCanvas2D>,
  series: PreparedSeries,
  height: number,
): void {
  const range = { min: input.model.minimum, max: input.model.maximum };
  const points = projectChartSeries(input.model, series, canvas.bounds.width);
  if (points.length === 0) return;
  const signed = input.model.signedDomain;
  const kind = series.kind;
  const glyph = seriesGlyph(series, input.widthProfile);
  const baseline = signed && range.min < 0 && range.max > 0
    ? yForValue(0, range, height)
    : Math.max(0, height - 1);
  if (kind === 'area' || kind === 'bar') {
    for (const point of points) {
      const polarity = polarityForValue(point.value);
      drawAreaSeries(canvas, [{ x: point.column, y: point.value }], {
        yScale: { domain: [range.min, range.max], range: [height - 1, 0] },
        baseline,
        span: chartSpan(
          input,
          glyph,
          'series',
          signed ? `series.${series.id}.${polarity}.${kind}` : `series.${series.id}.${kind}`,
          kind,
          pointStyle(input.model, series, point.value),
          point.point,
        ),
      });
    }
    return;
  }
  if (kind === 'scatter') {
    for (const point of points) {
      const polarity = polarityForValue(point.value);
      canvas.point(
        point.column,
        yForValue(point.value, range, height),
        chartSpan(
          input,
          glyph,
          'series',
          signed ? `series.${series.id}.${polarity}.point` : `series.${series.id}.point`,
          'point',
          pointStyle(input.model, series, point.value),
          point.point,
        ),
      );
    }
    return;
  }
  if (!signed && effectiveValueScale(input.model, series).length === 0) {
    drawLineSeries(canvas, points.map((point) => ({ x: point.column, y: point.value })), {
      yScale: { domain: [range.min, range.max], range: [height - 1, 0] },
      span: chartSpan(
        input,
        glyph,
        'series',
        `series.${series.id}.line`,
        'line',
        seriesStyle(series.seriesIndex),
      ),
    });
    return;
  }
  if (points.length === 1) {
    const point = points[0];
    if (point === undefined) return;
    canvas.point(
      point.column,
      yForValue(point.value, range, height),
      chartSpan(
        input,
        glyph,
        'series',
        signed
          ? `series.${series.id}.${polarityForValue(point.value)}.point`
          : `series.${series.id}.point`,
        'point',
        pointStyle(input.model, series, point.value),
        point.point,
      ),
    );
    return;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) continue;
    drawLineSeries(canvas, [
      { x: previous.column, y: previous.value },
      { x: current.column, y: current.value },
    ], {
      yScale: { domain: [range.min, range.max], range: [height - 1, 0] },
      span: chartSpan(
        input,
        glyph,
        'series',
        signed
          ? `series.${series.id}.${polarityForValue(current.value)}.line`
          : `series.${series.id}.line`,
        'line',
        pointStyle(input.model, series, current.value),
        current.point,
      ),
    });
  }
}

function chartAccessibility(input: ComponentAccessibilityInput<ChartModel>) {
  return {
    id: input.id,
    role: 'listbox' as const,
    label: input.model.label,
    description: `${String(input.model.series.length)} chart series.`,
    disabled: input.disabled,
    ...(input.focused ? { focused: true } : {}),
    children: input.model.series.map((series) => ({
      id: `${input.id}:${series.id}`,
      role: 'group' as const,
      label: series.label,
      description: `${String(series.points.length)} points.`,
      children: series.points.map((point) => ({
        id: `${input.id}:${series.id}:${point.id}`,
        role: 'option' as const,
        label: point.label,
        value: point.value,
        selected: input.model.selected?.seriesId === series.id &&
          input.model.selected.pointId === point.id,
      })),
    })),
  };
}

function chartHitTargets(input: ComponentInput<ChartModel>) {
  const layout = chartLayout(input.model, input.bounds.width, input.bounds.height);
  if (layout.plotWidth <= 0 || layout.plotHeight <= 0) return [];
  const range = { min: input.model.minimum, max: input.model.maximum };
  return input.model.series.flatMap((series) =>
    projectChartSeries(input.model, series, layout.plotWidth).map((point) => ({
      id: `${input.id ?? 'chart'}:${series.id}:${String(point.column)}`,
      bounds: {
        row: layout.plotRow + yForValue(point.value, range, layout.plotHeight),
        column: point.column,
        width: 1,
        height: 1,
      },
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: (): ChartAction => ({
        kind: 'select',
        seriesId: series.id,
        pointId: point.pointId,
      }),
    }))
  );
}

interface ChartLayout {
  readonly plotRow: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
  readonly footerRow?: number;
}

function chartLayout(model: ChartModel, width: number, height: number): ChartLayout {
  const headerRows = Number(model.legend) + Number(model.yLabel !== undefined);
  const footerRows = Number(model.xLabel !== undefined);
  return {
    plotRow: headerRows,
    plotWidth: width,
    plotHeight: Math.max(0, height - headerRows - footerRows),
    ...(footerRows === 0 ? {} : { footerRow: Math.max(0, height - 1) }),
  };
}

interface ProjectedPoint {
  readonly point: number;
  readonly pointId: string;
  readonly sourcePosition: number;
  readonly column: number;
  readonly value: number;
}

function projectChartSeries(
  model: ChartModel,
  series: PreparedSeries,
  width: number,
): readonly ProjectedPoint[] {
  if (width <= 0 || series.points.length === 0) return [];
  const mode = series.sampleMode ?? model.sampleMode;
  const align = series.sampleAlign ?? model.sampleAlign;
  if (mode === 'fit') return fitChartSeries(model, series, width, align);
  const count = Math.min(series.points.length, width);
  const start = mode === 'window' ? selectedWindowStart(model, series, count, align) : 0;
  const columnStart = mode === 'window' && align === 'end' ? Math.max(0, width - count) : 0;
  return Array.from({ length: count }, (_, index) => {
    const point = start + index;
    const value = series.points[point];
    return {
      point,
      pointId: value?.id ?? '',
      sourcePosition: point,
      column: columnStart + index,
      value: value?.value ?? 0,
    };
  });
}

function fitChartSeries(
  model: ChartModel,
  series: PreparedSeries,
  width: number,
  align: ChartSampleAlign,
): readonly ProjectedPoint[] {
  if (width === 1 || series.points.length === 1) {
    const point = align === 'end' ? series.points.length - 1 : 0;
    const value = series.points[point];
    return [{
      point,
      pointId: value?.id ?? '',
      sourcePosition: point,
      column: 0,
      value: value?.value ?? 0,
    }];
  }
  const interpolation = series.interpolation ?? model.interpolation;
  return Array.from({ length: width }, (_, column) => {
    const sourcePosition = (column / Math.max(1, width - 1)) * (series.points.length - 1);
    const point = Math.max(0, Math.min(series.points.length - 1, Math.round(sourcePosition)));
    const value = series.points[point];
    return {
      point,
      pointId: value?.id ?? '',
      sourcePosition,
      column,
      value: interpolation === 'linear'
        ? interpolatedChartValue(series.points, sourcePosition)
        : value?.value ?? 0,
    };
  });
}

function selectedWindowStart(
  model: ChartModel,
  series: PreparedSeries,
  windowSize: number,
  align: ChartSampleAlign,
): number {
  if (model.selected?.seriesId === series.id) {
    const selected = series.points.findIndex((point) => point.id === model.selected?.pointId);
    if (selected >= 0) {
      return Math.max(
        0,
        Math.min(
          series.points.length - windowSize,
          selected - Math.floor(windowSize / 2),
        ),
      );
    }
  }
  return align === 'end' ? Math.max(0, series.points.length - windowSize) : 0;
}

function interpolatedChartValue(points: readonly PreparedPoint[], position: number): number {
  const leftIndex = Math.max(0, Math.min(points.length - 1, Math.floor(position)));
  const rightIndex = Math.max(0, Math.min(points.length - 1, Math.ceil(position)));
  const left = points[leftIndex]?.value ?? 0;
  const right = points[rightIndex]?.value ?? left;
  return leftIndex === rightIndex ? left : left + (right - left) * (position - leftIndex);
}

function selectedChartPoint(model: ChartModel): {
  readonly series: PreparedSeries;
  readonly point: PreparedPoint;
} | undefined {
  if (model.selected === undefined) return undefined;
  const series = model.series.find((item) => item.id === model.selected?.seriesId);
  const point = series?.points.find((item) => item.id === model.selected?.pointId);
  return series === undefined || point === undefined ? undefined : { series, point };
}

function projectedSelection(
  model: ChartModel,
  series: PreparedSeries,
  width: number,
  pointIndex: number,
): ProjectedPoint | undefined {
  const points = projectChartSeries(model, series, width);
  if ((series.sampleMode ?? model.sampleMode) !== 'fit') {
    return points.find((point) => point.point === pointIndex);
  }
  return points.reduce<ProjectedPoint | undefined>((best, point) =>
    best === undefined ||
      Math.abs(point.sourcePosition - pointIndex) < Math.abs(best.sourcePosition - pointIndex)
      ? point
      : best, undefined);
}

function yForValue(
  value: number,
  range: { readonly min: number; readonly max: number },
  height: number,
): number {
  if (height <= 1) return 0;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(height - 1, Math.round((1 - ratio) * (height - 1))));
}

function seriesGlyph(
  series: PreparedSeries,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): string {
  const preferred = series.glyph ?? (series.kind === 'area' || series.kind === 'bar' ? '█' : '*');
  return oneCellGlyph(preferred, series.kind === 'area' || series.kind === 'bar' ? '#' : '*', {
    widthProfile,
  });
}

function pointStyle(model: ChartModel, series: PreparedSeries, value: number): TerminalStyle {
  const fallback = model.signedDomain
    ? polarityStyle(polarityForValue(value))
    : seriesStyle(series.seriesIndex);
  const scale = effectiveValueScale(model, series);
  if (scale.length === 0) return fallback;
  const ratio = Math.max(0, Math.min(1, (value - model.minimum) / (model.maximum - model.minimum)));
  let selected = scale[0];
  for (const stop of scale) {
    if (ratio < stop.at) break;
    selected = stop;
  }
  return selected === undefined
    ? fallback
    : { ...fallback, fg: { kind: 'theme', token: selected.token }, bold: true };
}

function effectiveValueScale(
  model: ChartModel,
  series: PreparedSeries,
): readonly ValueScaleStop[] {
  return series.valueScale.length === 0 ? model.valueScale : series.valueScale;
}

function polarityForValue(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive';
}

interface PreparedHeatCell {
  readonly id: string;
  readonly itemIndex: number;
  readonly row: number;
  readonly column: number;
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
}

interface HeatmapModel extends ChartStatus {
  readonly label: string;
  readonly rows: readonly (readonly PreparedHeatCell[])[];
  readonly minimum: number;
  readonly maximum: number;
  readonly selectedId?: string;
  readonly cellWidth: number;
  readonly gap: number;
  readonly valueScale: readonly ValueScaleStop[];
  readonly pointerState?: PointerInteractionState;
}

interface DynamicHeatmapOptions {
  readonly label: unknown;
  readonly rows: unknown;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly selected?: unknown;
  readonly cellWidth?: unknown;
  readonly gap?: unknown;
  readonly dataState?: unknown;
  readonly valueScale?: unknown;
  readonly emptyText?: unknown;
  readonly loadingText?: unknown;
  readonly errorText?: unknown;
  readonly pointerState?: unknown;
}

const heatmapBase = {
  name: 'terminal-ui/components/heatmap' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  optionFields: {
    label: null,
    rows: null,
    min: null,
    max: null,
    selected: null,
    cellWidth: null,
    gap: null,
    dataState: null,
    valueScale: null,
    emptyText: null,
    loadingText: null,
    errorText: null,
    pointerState: null,
  },
  states: ['disabled'] as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted'] as const,
  prepare: prepareHeatmap,
  measure: measureHeatmap,
  render: paintHeatmap,
  accessibility: heatmapAccessibility,
};

const passiveHeatmap = defineComponent<
  DynamicHeatmapOptions,
  HeatmapModel,
  never,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>(heatmapBase);

const activeHeatmap = defineComponent<
  DynamicHeatmapOptions,
  HeatmapModel,
  HeatmapAction,
  ChartStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...heatmapBase,
  keys: ({ model }) => ({
    arrowUp: () => ({ kind: 'move', rows: -1, columns: 0 }),
    arrowDown: () => ({ kind: 'move', rows: 1, columns: 0 }),
    arrowLeft: () => ({ kind: 'move', rows: 0, columns: -1 }),
    arrowRight: () => ({ kind: 'move', rows: 0, columns: 1 }),
    pageUp: () => ({ kind: 'pageRows', delta: -1 }),
    pageDown: () => ({ kind: 'pageRows', delta: 1 }),
    home: () => ({ kind: 'first' }),
    end: () => ({ kind: 'last' }),
    ...(model.selectedId === undefined
      ? {}
      : { enter: (): HeatmapAction => ({ kind: 'select', id: model.selectedId ?? '' }) }),
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: () => ignoreMessage(),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    const plan = heatmapPlan(input.model, input.bounds.height);
    return plan.rows.flatMap((row, rowOffset) =>
      row.flatMap((cell) => {
        if (cell.disabled) return [];
        const column = cell.column * (input.model.cellWidth + input.model.gap);
        if (column >= input.bounds.width) return [];
        return [{
          id: `${input.id ?? 'heatmap'}:${cell.id}`,
          bounds: {
            row: rowOffset,
            column,
            width: Math.min(input.model.cellWidth, input.bounds.width - column),
            height: 1,
          },
          cursor: 'pointer' as const,
          focus: { kind: 'target' as const, targetId: 'self' },
          message: (): HeatmapAction => ({ kind: 'select', id: cell.id }),
        }];
      })
    );
  },
});

export function heatmap<TValue, const TMessage extends ComponentMessage = never>(
  options: HeatmapOptions<TValue, TMessage>,
): Element<TMessage> {
  const own = snapshotHeatmapOptions(options);
  if (options.onAction === undefined) {
    return passiveHeatmap({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  return activeHeatmap({
    ...own,
    id: options.id,
    onAction: options.onAction,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
}

function snapshotHeatmapOptions<TValue>(
  options: HeatmapOptions<TValue, ComponentMessage>,
): DynamicHeatmapOptions {
  return { ...options };
}

function prepareHeatmap(value: unknown): HeatmapModel {
  if (!isNonArrayObject(value)) throw new TypeError('heatmap options must be an object.');
  if (!Array.isArray(value['rows'])) throw new TypeError('heatmap rows must be an array.');
  const label = nonEmpty(value['label'], 'heatmap label');
  const ids = new Set<string>();
  const values: number[] = [];
  let itemIndex = 0;
  const rows = Object.freeze(value['rows'].map((rawRow, row) => {
    if (!Array.isArray(rawRow)) {
      throw new TypeError(`heatmap rows[${String(row)}] must be an array.`);
    }
    return Object.freeze(rawRow.map((raw, column): PreparedHeatCell => {
      if (!isNonArrayObject(raw)) throw new TypeError('heatmap cell must be an object.');
      exact(raw, ['id', 'label', 'value', 'payload', 'disabled'], 'heatmap cell');
      const id = nonEmpty(raw['id'], 'heatmap cell id');
      if (ids.has(id)) throw new TypeError(`heatmap contains duplicate cell id "${id}".`);
      ids.add(id);
      const numeric = finite(raw['value'], 'heatmap cell value');
      values.push(numeric);
      const prepared = Object.freeze({
        id,
        itemIndex,
        row,
        column,
        label: nonEmpty(raw['label'], 'heatmap cell label'),
        value: numeric,
        disabled: optionalBoolean(raw['disabled'], 'heatmap cell disabled') ?? false,
      });
      itemIndex += 1;
      return prepared;
    }));
  }));
  const range = numericRange(values, value['min'], value['max'], 'heatmap');
  const selectedId = prepareSelectionId(value['selected'], 'heatmap selected');
  const pointerState = preparePointerState(value['pointerState'], 'heatmap');
  return {
    label,
    rows,
    minimum: range.min,
    maximum: range.max,
    ...(selectedId === undefined ? {} : { selectedId }),
    cellWidth: boundedInteger(value['cellWidth'], 1, 8, 3, 'heatmap cellWidth'),
    gap: boundedInteger(value['gap'], 0, 4, 1, 'heatmap gap'),
    valueScale: prepareValueScale(value['valueScale'], 'heatmap valueScale'),
    ...prepareStatus(value, 'heatmap', values.length === 0),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function measureHeatmap(input: ComponentMeasureInput<HeatmapModel>) {
  const widest = Math.max(
    0,
    ...input.model.rows.map((row) =>
      row.length * input.model.cellWidth + Math.max(0, row.length - 1) * input.model.gap
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: Math.min(160, Math.max(1, widest)),
    preferredHeight: Math.min(40, Math.max(1, input.model.rows.length)),
  };
}

function paintHeatmap(input: ComponentRenderInput<HeatmapModel, ChartStylePart>): void {
  if (paintStatus(input, input.model)) return;
  const plan = heatmapPlan(input.model, input.bounds.height);
  for (const [rowOffset, row] of plan.rows.entries()) {
    const spans: RenderSpan[] = [];
    for (const cell of row) {
      if (cell.column > 0) {
        spans.push(chartSpan(
          input,
          ' '.repeat(input.model.gap),
          'muted',
          `cell.${String(cell.row)}.${String(cell.column)}.gap`,
          'separator',
        ));
      }
      spans.push(...heatmapCellSpans(input, cell));
    }
    input.target.write(rowOffset, 0, spans);
  }
}

function heatmapCellSpans(
  input: ComponentRenderInput<HeatmapModel, ChartStylePart>,
  cell: PreparedHeatCell,
): readonly RenderSpan[] {
  const intensity = normalizedIndex(cell.value, input.model, 4);
  const glyphs = [' ', '░', '▒', '▓', '█'] as const;
  const glyph = glyphs[intensity] ?? glyphs[0];
  const selected = cell.id === input.model.selectedId;
  const style = heatmapStyle(input.model, cell.value, intensity, selected);
  const id = `cell.${cell.id}`;
  if (!selected) {
    return [chartSpan(
      input,
      fillTextCells(glyph, input.model.cellWidth, { widthProfile: input.widthProfile }),
      'series',
      `${id}.value`,
      'cell',
      style,
      cell.itemIndex,
    )];
  }
  if (input.model.cellWidth === 1) {
    return [chartSpan(
      input,
      oneCellGlyph('◆', '*', { widthProfile: input.widthProfile }),
      'series',
      `${id}.selected`,
      'selected',
      style,
      cell.itemIndex,
    )];
  }
  if (input.model.cellWidth === 2) {
    return [
      chartSpan(input, '›', 'series', `${id}.selected.marker`, 'marker', style),
      chartSpan(
        input,
        fillTextCells(glyph, 1, { widthProfile: input.widthProfile }),
        'series',
        `${id}.value`,
        'cell',
        style,
        cell.itemIndex,
      ),
    ];
  }
  return [
    chartSpan(input, '[', 'series', `${id}.selected.open`, 'marker', style),
    chartSpan(
      input,
      fillTextCells(glyph, Math.max(1, input.model.cellWidth - 2), {
        widthProfile: input.widthProfile,
      }),
      'series',
      `${id}.value`,
      'cell',
      style,
      cell.itemIndex,
    ),
    chartSpan(input, ']', 'series', `${id}.selected.close`, 'marker', style),
  ];
}

function heatmapAccessibility(input: ComponentAccessibilityInput<HeatmapModel>) {
  const plan = heatmapPlan(input.model, input.bounds.height);
  const columnCount = Math.max(0, ...input.model.rows.map((row) => row.length));
  return {
    id: input.id,
    role: 'grid' as const,
    label: input.model.label,
    description: `${String(input.model.rows.length)} heatmap rows. Showing ${
      String(plan.start + 1)
    }-${String(plan.end)}.`,
    disabled: input.disabled,
    ...(input.focused ? { focused: true } : {}),
    children: plan.rows.map((row, rowOffset) => {
      const rowIndex = plan.start + rowOffset;
      return {
        id: `${input.id}:row:${String(rowIndex)}`,
        role: 'row' as const,
        position: {
          rowIndex: rowIndex + 1,
          rowCount: input.model.rows.length,
          columnCount: Math.max(1, row.length),
        },
        children: row.map((cell) => ({
          id: `${input.id}:${cell.id}`,
          role: 'gridcell' as const,
          label: cell.label,
          value: cell.value,
          disabled: cell.disabled,
          selected: cell.id === input.model.selectedId,
          position: {
            rowIndex: rowIndex + 1,
            rowCount: input.model.rows.length,
            columnIndex: cell.column + 1,
            columnCount: Math.max(1, columnCount),
          },
        })),
      };
    }),
  };
}

function heatmapPlan(model: HeatmapModel, height: number) {
  const selected = model.rows.findIndex((row) => row.some((cell) => cell.id === model.selectedId));
  const window = visibleWindow(model.rows.length, height, Math.max(0, selected));
  return { ...window, rows: model.rows.slice(window.start, window.end) };
}

function heatmapStyle(
  model: HeatmapModel,
  value: number,
  intensity: number,
  selected: boolean,
): TerminalStyle {
  if (selected) return selectedStyle();
  let base: TerminalStyle = intensity <= 0
    ? { fg: { kind: 'theme', token: 'chart.muted' }, dim: true }
    : {
      fg: { kind: 'theme', token: 'chart.series.1' },
      ...(intensity === 1 ? { dim: true } : {}),
      ...(intensity >= 3 ? { bold: true } : {}),
    };
  if (model.valueScale.length === 0) return base;
  const ratio = Math.max(0, Math.min(1, (value - model.minimum) / (model.maximum - model.minimum)));
  let stop = model.valueScale[0];
  for (const candidate of model.valueScale) {
    if (ratio < candidate.at) break;
    stop = candidate;
  }
  if (stop !== undefined) base = { ...base, fg: { kind: 'theme', token: stop.token }, bold: true };
  return base;
}

function prepareStatus(
  value: Readonly<Record<string, unknown>>,
  owner: string,
  empty: boolean,
): ChartStatus {
  const dataState = value['dataState'];
  if (dataState !== undefined && dataState !== 'loading' && dataState !== 'error') {
    throw new TypeError(`${owner} dataState must be loading or error.`);
  }
  return {
    ...(dataState === undefined ? {} : { dataState }),
    empty,
    emptyText: optionalText(value['emptyText'], `${owner} emptyText`) ?? 'No data',
    loadingText: optionalText(value['loadingText'], `${owner} loadingText`) ?? 'Loading',
    errorText: optionalText(value['errorText'], `${owner} errorText`) ?? 'Unavailable',
  };
}

function paintStatus<TModel extends ChartStatus>(
  input: ComponentRenderInput<TModel, ChartStylePart>,
  model: TModel,
): boolean {
  const kind = model.dataState ?? (model.empty ? 'empty' : undefined);
  if (kind === undefined) return false;
  const text = kind === 'loading'
    ? model.loadingText
    : kind === 'error'
    ? model.errorText
    : model.emptyText;
  input.target.write(0, 0, [chartSpan(
    input,
    text,
    kind === 'error' ? 'value' : 'muted',
    `state.${kind}.message`,
    kind,
    kind === 'error'
      ? { fg: { kind: 'theme', token: 'status.error' }, bold: true }
      : { fg: { kind: 'theme', token: 'chart.muted' }, dim: true },
  )]);
  return true;
}

function chartSpan<TModel extends object>(
  input: ComponentRenderInput<TModel, ChartStylePart>,
  text: string,
  part: ChartStylePart,
  description: string,
  partType: string,
  base?: TerminalStyle,
  itemIndex?: number,
  state?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>,
): RenderSpan {
  const style = input.style({
    part,
    ...(state === undefined && partType !== 'selected' ? {} : { state: state ?? 'selected' }),
    ...(base === undefined ? {} : { base }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      cellRole: partType === 'separator' || partType === 'baseline'
        ? 'separator'
        : partType === 'label' || partType === 'legend' || partType === 'metric' ||
            partType === 'empty' || partType === 'loading' || partType === 'error'
        ? 'text'
        : partType === 'marker'
        ? 'decoration'
        : 'chart',
      partName: description,
      partType,
      description,
      ...(itemIndex === undefined ? {} : { itemIndex }),
    }),
  });
}

function seriesStyle(index: number): TerminalStyle {
  return { fg: seriesThemeColor(index), bold: true };
}

function selectedStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true,
  };
}

function polarityStyle(polarity: 'positive' | 'negative'): TerminalStyle {
  return {
    fg: { kind: 'theme', token: polarity === 'positive' ? 'chart.positive' : 'chart.negative' },
    bold: true,
  };
}

function seriesThemeColor(index: number): {
  readonly kind: 'theme';
  readonly token: 'chart.series.1' | 'chart.series.2' | 'chart.series.3';
} {
  switch (index % 3) {
    case 1:
      return { kind: 'theme', token: 'chart.series.2' };
    case 2:
      return { kind: 'theme', token: 'chart.series.3' };
    default:
      return { kind: 'theme', token: 'chart.series.1' };
  }
}

function numericRange(
  values: readonly number[],
  rawMin: unknown,
  rawMax: unknown,
  owner: string,
): { readonly min: number; readonly max: number } {
  const explicitMin = optionalFinite(rawMin, `${owner} min`);
  const explicitMax = optionalFinite(rawMax, `${owner} max`);
  const min = explicitMin ?? (values.length === 0 ? 0 : Math.min(...values));
  const candidateMax = explicitMax ?? (values.length === 0 ? 1 : Math.max(...values));
  if (explicitMin !== undefined && explicitMax !== undefined && candidateMax <= min) {
    throw new RangeError(`${owner} max must be greater than min.`);
  }
  return { min, max: candidateMax <= min ? min + 1 : candidateMax };
}

function normalizedIndex(
  value: number,
  range: { readonly minimum: number; readonly maximum: number },
  maximum: number,
): number {
  const ratio = Math.max(0, Math.min(1, (value - range.minimum) / (range.maximum - range.minimum)));
  return Math.max(0, Math.min(maximum, Math.round(ratio * maximum)));
}

function prepareValueScale(value: unknown, owner: string): readonly ValueScaleStop[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  if (value.length > 32) throw new RangeError(`${owner} cannot contain more than 32 stops.`);
  const stops = value.map((raw, index): ValueScaleStop => {
    if (!isNonArrayObject(raw)) {
      throw new TypeError(`${owner}[${String(index)}] must be an object.`);
    }
    exact(raw, ['at', 'token', 'label'], `${owner}[${String(index)}]`);
    const at = finite(raw['at'], `${owner}[${String(index)}].at`);
    if (at < 0 || at > 1) throw new RangeError(`${owner} stop positions must be from 0 through 1.`);
    const token = raw['token'];
    if (typeof token !== 'string' || !isThemeColorToken(token)) {
      throw new TypeError(`${owner} stop tokens must be valid theme color tokens.`);
    }
    const label = optionalText(raw['label'], `${owner}[${String(index)}].label`);
    if (label?.trim() === '') {
      throw new TypeError(`${owner} stop labels must be non-empty.`);
    }
    return Object.freeze({ at, token, ...(label === undefined ? {} : { label }) });
  });
  return Object.freeze([...stops].sort((left, right) => left.at - right.at));
}

function visibleWindow(total: number, height: number, preferred: number) {
  const count = Math.max(0, Math.min(total, Math.floor(height)));
  if (count === 0) return { start: 0, end: 0 };
  const center = Math.max(0, Math.min(total - 1, preferred));
  const start = Math.max(0, Math.min(total - count, center - Math.floor(count / 2)));
  return { start, end: start + count };
}

function prepareChartSelection(value: unknown): ChartModel['selected'] {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('chart selected must be an object.');
  exact(value, ['seriesId', 'pointId'], 'chart selected');
  return {
    seriesId: nonEmpty(value['seriesId'], 'chart selected seriesId'),
    pointId: nonEmpty(value['pointId'], 'chart selected pointId'),
  };
}

function prepareSelectionId(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  exact(value, ['id'], owner);
  return nonEmpty(value['id'], `${owner} id`);
}

function preparePointerState(
  value: unknown,
  owner: string,
): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} pointerState must be an object.`);
  exact(value, ['hoveredTargetId', 'pressedTargetId'], `${owner} pointerState`);
  const hoveredTargetId = value['hoveredTargetId'];
  const pressedTargetId = value['pressedTargetId'];
  if (hoveredTargetId !== undefined && typeof hoveredTargetId !== 'string') {
    throw new TypeError(`${owner} hoveredTargetId must be a string.`);
  }
  if (pressedTargetId !== undefined && typeof pressedTargetId !== 'string') {
    throw new TypeError(`${owner} pressedTargetId must be a string.`);
  }
  return {
    ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
    ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
  };
}

function optionalPreparedGlyph(value: unknown, owner: string): { readonly glyph?: string } {
  const glyph = optionalText(value, owner);
  if (glyph === undefined) return {};
  if (Array.from(glyph).length !== 1) throw new TypeError(`${owner} must be one glyph.`);
  return { glyph };
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
  owner: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`${owner} must be a safe integer.`);
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${owner} must be from ${String(minimum)} through ${String(maximum)}.`);
  }
  return value;
}

function optionalEnum<const TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  owner: string,
): TValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as TValue)) {
    throw new TypeError(`${owner} is invalid.`);
  }
  return value as TValue;
}

function optionalProperty<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): Readonly<Partial<Record<TKey, TValue>>> {
  return (value === undefined ? {} : { [key]: value }) as Readonly<Partial<Record<TKey, TValue>>>;
}

function optionalText(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function nonEmpty(value: unknown, owner: string): string {
  const result = optionalText(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be a non-empty string.`);
  }
  return result;
}

function finite(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${owner} must be finite.`);
  }
  return value;
}

function optionalFinite(value: unknown, owner: string): number | undefined {
  return value === undefined ? undefined : finite(value, owner);
}

function optionalBoolean(value: unknown, owner: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}

function exact(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  owner: string,
): void {
  const unsupported = Object.keys(value).find((field) => !fields.includes(field));
  if (unsupported !== undefined) {
    throw new TypeError(`${owner} contains unknown field "${unsupported}".`);
  }
}
