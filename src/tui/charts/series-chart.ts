import type { AccessibleNode } from '../../accessibility/index.ts';
import type { ChartSeries } from '../../components/options/feedback.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import {
  chartBaselineStyle,
  chartPolarityStyle,
  chartSelectedStyle,
  chartSeriesStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartTextFromBlock
} from '../chart-visual.ts';
import { createCanvas2D, drawAreaSeries, drawLineSeries } from '../canvas2d/index.ts';
import { createFrameBuffer } from '../frame-buffer.ts';
import type { LayoutNode, Rect } from '../layout.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../render-primitives.ts';
import type { HitTarget } from '../render-node-renderer.ts';
import { normalizeValueScale } from '../value-scale.ts';
import type { NormalizedValueScaleStop } from '../value-scale.ts';
import {
  type ProjectedChartPoint,
  chartChromeBlock,
  chartLayout,
  chartMessageFactory,
  chartPointPosition,
  chartPointStyle,
  chartSeries,
  chartSeriesScale,
  cleanLabel,
  frameBufferBlock,
  polarityForValue,
  projectChartSeries,
  rangeFor,
  selectedChartPoint,
  seriesGlyph,
  usesSignedDomain,
  writeChartChrome,
  yForValue
} from './support.ts';

export function chartBlock(widget: RenderNode, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  const state = chartStateBlock(widget, 'chart', theme, {
    empty: points.length === 0,
    emptyText: chartStateDescription(widget, 'No chart data'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  if (node.bounds.height <= 0 || node.bounds.width <= 0) return { lines: [] };
  const layout = chartLayout(widget, node.bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) return chartChromeBlock(widget, node.bounds.width);
  const range = rangeFor(points, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const widgetScale = normalizeValueScale(widget.props['valueScale']);
  const buffer = createFrameBuffer(node.bounds.width, node.bounds.height);
  writeChartChrome(buffer, widget, node.bounds.width);
  const canvas = createCanvas2D(buffer, {
    row: layout.plotRow,
    column: 1,
    width: layout.plotWidth,
    height: layout.plotHeight
  });
  if (usesSignedDomain(widget) && range.min < 0 && range.max > 0) {
    canvas.line(0, yForValue(0, range, layout.plotHeight), Math.max(0, layout.plotWidth - 1), yForValue(0, range, layout.plotHeight), chartSpan(
      widget,
      'chart',
      'baseline',
      'baseline.zero',
      '─',
      chartBaselineStyle(widget)
    ));
  }
  for (const [seriesIndex, item] of series.entries()) {
    const visible = projectChartSeries(widget, item, layout.plotWidth);
    const glyph = seriesGlyph(item);
    const seriesStyle = chartSeriesStyle(widget, seriesIndex);
    const seriesScale = chartSeriesScale(item, widgetScale);
    if (item.kind === 'area' || item.kind === 'bar') {
      drawFilledChartSeries(canvas, widget, item, visible, range, layout.plotHeight, glyph, seriesStyle, seriesScale, usesSignedDomain(widget));
    } else if (item.kind === 'scatter') {
      visible.forEach((projected) => {
        const signed = usesSignedDomain(widget);
        const polarity = polarityForValue(projected.value);
        canvas.point(
          projected.column,
          yForValue(projected.value, range, layout.plotHeight),
          chartSpan(
            widget,
            'chart',
            'point',
            signed ? `series.${item.id}.${polarity}.point` : `series.${item.id}.point`,
            glyph,
            chartPointStyle(projected.value, range, seriesScale, signed ? chartPolarityStyle(widget, polarity) : seriesStyle)
          )
        );
      });
    } else if (usesSignedDomain(widget) || seriesScale.length > 0) {
      drawSegmentedChartLine(canvas, widget, item, visible, range, layout.plotHeight, glyph, seriesStyle, seriesScale, usesSignedDomain(widget));
    } else {
      drawLineSeries(canvas, visible.map((projected) => ({ x: projected.column, y: projected.value })), {
        yScale: { domain: [range.min, range.max], range: [layout.plotHeight - 1, 0] },
        span: chartSpan(widget, 'chart', 'line', `series.${item.id}.line`, glyph, seriesStyle)
      });
    }
  }
  const selected = selectedChartPoint(widget, series);
  if (selected !== undefined) {
    const position = chartPointPosition(widget, node.bounds, selected.series, selected.point, range);
    if (position !== undefined) {
      buffer.write(position.row, position.column, [
        chartSpan(widget, 'chart', 'selected', `selection.${selected.series}.${String(selected.point)}`, '◆', chartSelectedStyle(widget))
      ]);
    }
  }
  return frameBufferBlock(buffer, node.bounds.width, node.bounds.height);
}

function drawFilledChartSeries(
  canvas: ReturnType<typeof createCanvas2D>,
  widget: RenderNode,
  item: ChartSeries,
  visible: readonly ProjectedChartPoint[],
  range: { readonly min: number; readonly max: number },
  height: number,
  glyph: string,
  fallback: ReturnType<typeof chartSeriesStyle>,
  scale: readonly NormalizedValueScaleStop[],
  signed: boolean
): void {
  if (visible.length === 0) return;
  const kind = item.kind === 'bar' ? 'bar' : 'area';
  const baseline = signed && range.min < 0 && range.max > 0
    ? yForValue(0, range, height)
    : Math.max(0, height - 1);
  for (const projected of visible) {
    const polarity = polarityForValue(projected.value);
    drawAreaSeries(canvas, [{ x: projected.column, y: projected.value }], {
      yScale: { domain: [range.min, range.max], range: [height - 1, 0] },
      baseline,
      span: chartSpan(
        widget,
        'chart',
        kind,
        signed ? `series.${item.id}.${polarity}.${kind}` : `series.${item.id}.${kind}`,
        glyph,
        chartPointStyle(projected.value, range, scale, signed ? chartPolarityStyle(widget, polarity) : fallback)
      )
    });
  }
}

function drawSegmentedChartLine(
  canvas: ReturnType<typeof createCanvas2D>,
  widget: RenderNode,
  item: ChartSeries,
  visible: readonly ProjectedChartPoint[],
  range: { readonly min: number; readonly max: number },
  height: number,
  glyph: string,
  fallback: ReturnType<typeof chartSeriesStyle>,
  scale: readonly NormalizedValueScaleStop[],
  signed: boolean
): void {
  if (visible.length === 0) return;
  if (visible.length === 1) {
    const projected = visible[0];
    if (projected === undefined) return;
    const polarity = polarityForValue(projected.value);
    canvas.point(projected.column, yForValue(projected.value, range, height), chartSpan(
      widget,
      'chart',
      'point',
      signed ? `series.${item.id}.${polarity}.point` : `series.${item.id}.point`,
      glyph,
      chartPointStyle(projected.value, range, scale, signed ? chartPolarityStyle(widget, polarity) : fallback)
    ));
    return;
  }
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1];
    const current = visible[index];
    if (previous === undefined || current === undefined) continue;
    const polarity = polarityForValue(current.value);
    drawLineSeries(canvas, [{ x: previous.column, y: previous.value }, { x: current.column, y: current.value }], {
      yScale: { domain: [range.min, range.max], range: [height - 1, 0] },
      span: chartSpan(
        widget,
        'chart',
        'line',
        signed ? `series.${item.id}.${polarity}.line` : `series.${item.id}.line`,
        glyph,
        chartPointStyle(current.value, range, scale, signed ? chartPolarityStyle(widget, polarity) : fallback)
      )
    });
  }
}

export function chartText(widget: RenderNode, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(chartBlock(widget, node, theme));
}

export function chartAccessibleBase(widget: RenderNode, id: string): AccessibleNode {
  const series = chartSeries(widget.props['series']);
  return {
    id,
    role: 'text',
    label: id,
    description: `${String(series.length)} chart series.`
  };
}

export function chartAccessibleChildren(widget: RenderNode): readonly AccessibleNode[] {
  const series = chartSeries(widget.props['series']);
  const selected = selectedChartPoint(widget, series);
  return series.map((item) => ({
    id: `${widget.id ?? 'chart'}:${item.id}`,
    role: 'text',
    label: item.label ?? item.id,
    value: `${String(item.points.length)} points`,
    selected: selected?.series === item.id
  }));
}

export function chartHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = chartMessageFactory(widget);
  if (toMessage === undefined) return [];
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0) return [];
  const range = rangeFor(points, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const layout = chartLayout(widget, bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) return [];
  return series.flatMap((item) => projectChartSeries(widget, item, layout.plotWidth).flatMap((projected): HitTarget<TMessage>[] => {
    const row = bounds.row + layout.plotRow - 1 + yForValue(projected.value, range, layout.plotHeight);
    const column = bounds.column + projected.column;
    return [{
      id: `${widget.id ?? 'chart'}:${item.id}:${String(projected.column)}`,
      bounds: { row, column, width: 1, height: 1 },
      message: () => toMessage({
        series: item.id,
        ...(item.label === undefined ? {} : { seriesLabel: item.label }),
        point: projected.point,
        value: projected.value
      }),
      cursor: 'pointer'
    }];
  }));
}
