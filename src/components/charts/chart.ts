import type { ChartSampleAlign, ValueScaleStop } from '../../behavior/visualization-data.ts';
import type { ChartTransition } from '../../behavior/visualization.ts';
import type {
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import { assertOptionalCallback } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  assertCollectionInteractionReferences,
  createCollectionInteractionIndex,
  decodeSelectionState,
  selectionContains,
} from '../../interaction/collection-interaction.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { createComponentCanvas2D } from '../../renderer/canvas2d/canvas2d.ts';
import { drawAreaSeries, drawLineSeries } from '../../renderer/canvas2d/chart.ts';
import { oneCellGlyph } from '../../text/cell-geometry.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { inspectSelection } from '../shared/inspection.ts';
import type { ChartStylePart } from '../style-parts.ts';
import type {
  ChartComponentAction,
  ChartComponentOptions,
  ChartLayout,
  ChartModel,
  ChartPointModel,
  ChartSeriesModel,
  ProjectedPoint,
} from './contracts.ts';
import type { ChartOptions } from './options.ts';
import {
  assertVisualizationCallbacks,
  chartSpan,
  decodeValueScale,
  decodeVisualizationStatus,
  finite,
  nonEmpty,
  numericRange,
  optionalBoolean,
  optionalEnum,
  optionalGlyph,
  optionalText,
  paintStatus,
  polarityStyle,
  selectedStyle,
  seriesStyle,
  visualizationUnavailable,
  withoutVisualizationBehavior,
} from './shared.ts';

const chartBase = {
  name: 'terminal-ui/components/chart' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  states: ['busy'] as const,
  accessibleRole: 'listbox' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted', 'baseline'] as const,
  visualStates: ['active', 'selected', 'disabled', 'busy'] as const,
  measure: measureChart,
  retainPaint: true as const,
  render: paintChart,
  accessibility: chartAccessibility,
  inspection: ({ model }: { readonly model: Readonly<ChartModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: 0,
      totalCount: model.series.reduce((total, series) => total + series.points.length, 0),
      visibleCount: model.series.reduce((total, series) => total + series.points.length, 0),
    },
  }),
};

const passiveChart = defineComponent<ChartComponentOptions>()({ ...chartBase, createModel: createChartModel });

const activeChart = defineComponent<ChartComponentOptions, ChartComponentAction>()({
  ...chartBase,
  states: ['disabled', 'busy', 'inert'],
  createModel: createChartModel,
  keys: ({ model, busy }) => {
    if (busy) return {};
    const transition = (value: ChartTransition): ChartComponentAction => ({ kind: 'transition', transition: value });
    return {
      arrowLeft: () => transition({ kind: 'movePoint', delta: -1 }),
      arrowRight: () => transition({ kind: 'movePoint', delta: 1 }),
      arrowUp: () => transition({ kind: 'moveSeries', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveSeries', delta: 1 }),
      pageUp: () => transition({ kind: 'pagePoints', delta: -1 }),
      pageDown: () => transition({ kind: 'pagePoints', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      ...(model.activeId === undefined ? {} : {
        enter: () => ({ kind: 'activate' as const, event: { kind: 'activate' as const, id: model.activeId ?? '' } }),
      }),
    };
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: (input) => input.busy ? [] : chartHitTargets(input),
});

export function chart<const TMessage extends ComponentMessage = never>(
  options: ChartOptions<TMessage>,
): Element<TMessage> {
  if (options.state === undefined) {
    return passiveChart(withoutVisualizationBehavior(options));
  }
  const componentOptions = withoutVisualizationBehavior(options);
  assertOptionalCallback(options.onActivate, 'chart onActivate');
  if (options.onTransition === undefined) {
    if (!visualizationUnavailable(options)) assertVisualizationCallbacks(options, 'chart');
    return activeChart({ ...componentOptions, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertVisualizationCallbacks(options, 'chart');
  return activeChart({
    ...componentOptions,
    onAction: (action) => {
      if (action.kind === 'transition') return options.onTransition(action.transition);
      return options.onActivate?.(action.event) ?? ignoreMessage();
    },
  });
}

function createChartModel(value: Readonly<ChartComponentOptions>): ChartModel {
  const label = nonEmpty(value.label, 'chart label');
  const seriesIds = new Set<string>();
  const globalPointIds = new Set<string>();
  const values: number[] = [];
  const series = Object.freeze(value.series.map((candidate, seriesIndex): ChartSeriesModel => {
    const id = nonEmpty(candidate.id, 'chart series id');
    if (seriesIds.has(id)) throw new TypeError(`chart contains duplicate series id "${id}".`);
    seriesIds.add(id);
    const pointIds = new Set<string>();
    const points = Object.freeze(candidate.points.map((raw, pointIndex): ChartPointModel => {
      const pointId = nonEmpty(raw.id, 'chart point id');
      if (pointIds.has(pointId)) {
        throw new TypeError(`chart series "${id}" contains duplicate point id "${pointId}".`);
      }
      if (globalPointIds.has(pointId)) {
        throw new TypeError(`chart point ids must be unique across series; duplicate id "${pointId}".`);
      }
      pointIds.add(pointId);
      globalPointIds.add(pointId);
      const pointValue = finite(raw.value, 'chart point value');
      values.push(pointValue);
      return Object.freeze({
        id: pointId,
        pointIndex,
        label: nonEmpty(raw.label, 'chart point label'),
        value: pointValue,
      });
    }));
    const sampleMode = optionalEnum(
      candidate.sampleMode,
      ['one-per-column', 'fit', 'window'],
      'chart series sampleMode',
    );
    const sampleAlign = optionalEnum(
      candidate.sampleAlign,
      ['start', 'end'],
      'chart series sampleAlign',
    );
    const interpolation = optionalEnum(
      candidate.interpolation,
      ['nearest', 'linear'],
      'chart series interpolation',
    );
    return Object.freeze({
      id,
      seriesIndex,
      label: nonEmpty(candidate.label, 'chart series label'),
      points,
      kind:
        optionalEnum(candidate.kind, ['line', 'scatter', 'area', 'bar'], 'chart series kind') ??
          'line',
      ...optionalGlyph(candidate.glyph, 'chart series glyph'),
      valueScale: decodeValueScale(candidate.valueScale, 'chart series valueScale'),
      ...(sampleMode === undefined ? {} : { sampleMode }),
      ...(sampleAlign === undefined ? {} : { sampleAlign }),
      ...(interpolation === undefined ? {} : { interpolation }),
    });
  }));
  const range = numericRange(values, value.min, value.max, 'chart');
  const activeId = value.state?.activeId === undefined
    ? undefined
    : nonEmpty(value.state.activeId, 'chart activeId');
  const selection = decodeSelectionState(
    value.state?.selection ?? { mode: 'none' },
    'chart selection',
  );
  assertCollectionInteractionReferences(
    { ...(activeId === undefined ? {} : { activeId }), selection },
    createCollectionInteractionIndex(series.flatMap((item) => item.points.map((point) => point.id))),
    'chart state',
  );
  const xLabel = optionalText(value.xLabel, 'chart xLabel');
  const yLabel = optionalText(value.yLabel, 'chart yLabel');
  return {
    label,
    series,
    minimum: range.min,
    maximum: range.max,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    showLegend: optionalBoolean(value.showLegend, 'chart showLegend') ?? false,
    signedDomain: optionalBoolean(value.signedDomain, 'chart signedDomain') ?? false,
    ...(xLabel === undefined ? {} : { xLabel }),
    ...(yLabel === undefined ? {} : { yLabel }),
    valueScale: decodeValueScale(value.valueScale, 'chart valueScale'),
    sampleMode: optionalEnum(
      value.sampleMode,
      ['one-per-column', 'fit', 'window'],
      'chart sampleMode',
    ) ?? 'one-per-column',
    sampleAlign: optionalEnum(value.sampleAlign, ['start', 'end'], 'chart sampleAlign') ??
      'start',
    interpolation: optionalEnum(
      value.interpolation,
      ['nearest', 'linear'],
      'chart interpolation',
    ) ?? 'nearest',
    ...decodeVisualizationStatus(value, 'chart', values.length === 0),
  };
}

function measureChart(input: ComponentMeasureInput<ChartModel>) {
  const widestSeries = Math.max(1, ...input.model.series.map((series) => series.points.length));
  const legendWidth = input.model.showLegend
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
        8 + Number(input.model.showLegend) + Number(input.model.xLabel !== undefined) +
          Number(input.model.yLabel !== undefined),
      ),
    ),
  };
}

function paintChart(input: ComponentRenderInput<ChartModel, ChartStylePart>): undefined {
  if (paintStatus(input, input.model)) return;
  const layout = chartLayout(input.model, input.bounds.width, input.bounds.height);
  paintChartLabels(input, layout);
  if (layout.plotWidth <= 0 || layout.plotHeight <= 0) return;
  const canvas = createComponentCanvas2D(input.target, {
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
  for (const selected of selectedChartPoints(input.model)) {
    paintChartPointMarker(
      input,
      canvas,
      selected,
      layout.plotWidth,
      layout.plotHeight,
      selected.point.id === input.model.activeId ? ['selected', 'active'] : ['selected'],
    );
  }
  const active = activeChartPoint(input.model);
  if (active === undefined || selectionContains(input.model.selection, active.point.id)) return;
  paintChartPointMarker(input, canvas, active, layout.plotWidth, layout.plotHeight, ['active']);
}

function paintChartPointMarker(
  input: ComponentRenderInput<ChartModel, ChartStylePart>,
  canvas: ReturnType<typeof createComponentCanvas2D>,
  target: { readonly series: ChartSeriesModel; readonly point: ChartPointModel },
  plotWidth: number,
  plotHeight: number,
  states: readonly ('active' | 'selected')[],
): void {
  const projected = projectedSelection(
    input.model,
    target.series,
    plotWidth,
    target.point.pointIndex,
  );
  if (projected === undefined) return;
  const selected = states.includes('selected');
  canvas.point(
    projected.column,
    yForValue(projected.value, { min: input.model.minimum, max: input.model.maximum }, plotHeight),
    chartSpan(
      input,
      oneCellGlyph(selected ? '◆' : '◇', '*', { widthProfile: input.widthProfile }),
      'series',
      `${selected ? 'selection' : 'active'}.${target.series.id}.${target.point.id}`,
      selected ? 'selected' : 'active',
      selected ? selectedStyle() : seriesStyle(target.series.seriesIndex),
      target.point.pointIndex,
      states,
    ),
  );
}

function paintChartLabels(
  input: ComponentRenderInput<ChartModel, ChartStylePart>,
  layout: ChartLayout,
): void {
  let row = 0;
  if (input.model.showLegend) {
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
  canvas: ReturnType<typeof createComponentCanvas2D>,
  series: ChartSeriesModel,
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
        selected: selectionContains(input.model.selection, point.id),
        current: input.model.activeId === point.id,
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
      accepts: ['pointerDown'] as const,
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: (event: RoutedPointerEvent) =>
        event.button !== 'left'
          ? ignoreMessage()
          : {
            kind: 'transition' as const,
            transition: { kind: 'setActive' as const, id: point.pointId },
          },
    }))
  );
}

function chartLayout(model: ChartModel, width: number, height: number): ChartLayout {
  const headerRows = Number(model.showLegend) + Number(model.yLabel !== undefined);
  const footerRows = Number(model.xLabel !== undefined);
  return {
    plotRow: headerRows,
    plotWidth: width,
    plotHeight: Math.max(0, height - headerRows - footerRows),
    ...(footerRows === 0 ? {} : { footerRow: Math.max(0, height - 1) }),
  };
}

function projectChartSeries(
  model: ChartModel,
  series: ChartSeriesModel,
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
  series: ChartSeriesModel,
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
  series: ChartSeriesModel,
  windowSize: number,
  align: ChartSampleAlign,
): number {
  if (model.activeId !== undefined) {
    const active = series.points.findIndex((point) => point.id === model.activeId);
    if (active >= 0) {
      return Math.max(
        0,
        Math.min(
          series.points.length - windowSize,
          active - Math.floor(windowSize / 2),
        ),
      );
    }
  }
  return align === 'end' ? Math.max(0, series.points.length - windowSize) : 0;
}

function interpolatedChartValue(points: readonly ChartPointModel[], position: number): number {
  const leftIndex = Math.max(0, Math.min(points.length - 1, Math.floor(position)));
  const rightIndex = Math.max(0, Math.min(points.length - 1, Math.ceil(position)));
  const left = points[leftIndex]?.value ?? 0;
  const right = points[rightIndex]?.value ?? left;
  return leftIndex === rightIndex ? left : left + (right - left) * (position - leftIndex);
}

function activeChartPoint(model: ChartModel): {
  readonly series: ChartSeriesModel;
  readonly point: ChartPointModel;
} | undefined {
  if (model.activeId === undefined) return undefined;
  const series = model.series.find((item) => item.points.some((point) => point.id === model.activeId));
  const point = series?.points.find((item) => item.id === model.activeId);
  return series === undefined || point === undefined ? undefined : { series, point };
}

function selectedChartPoints(model: ChartModel): readonly {
  readonly series: ChartSeriesModel;
  readonly point: ChartPointModel;
}[] {
  if (model.selection.mode === 'none') return [];
  const ids = model.selection.mode === 'single'
    ? model.selection.selectedId === undefined ? [] : [model.selection.selectedId]
    : model.selection.selectedIds;
  const selected = new Set(ids);
  return model.series.flatMap((series) =>
    series.points
      .filter((point) => selected.has(point.id))
      .map((point) => ({ series, point }))
  );
}

function projectedSelection(
  model: ChartModel,
  series: ChartSeriesModel,
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
  series: ChartSeriesModel,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): string {
  const graphical = ['█', '▓', '▒', '░'] as const;
  const ascii = ['*', '+', 'o', 'x'] as const;
  const index = series.seriesIndex % ascii.length;
  const fallback = ascii[index] ?? '*';
  const preferred = series.glyph ?? (
    series.kind === 'area' || series.kind === 'bar'
      ? graphical[index] ?? '█'
      : fallback
  );
  return oneCellGlyph(preferred, fallback, {
    widthProfile,
  });
}

function pointStyle(model: ChartModel, series: ChartSeriesModel, value: number): TerminalStyle {
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
  series: ChartSeriesModel,
): readonly ValueScaleStop[] {
  return series.valueScale.length === 0 ? model.valueScale : series.valueScale;
}

function polarityForValue(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive';
}
