import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { ChartSeries } from '../../../ui-model/feedback.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
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
import type { LayoutNode, Rect } from '../../model/layout.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../../../visual/render.ts';
import type { HitTarget } from '../../model/renderer.ts';
import { oneCellGlyph } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import { normalizeValueScale } from '../value-scale.ts';
import type { NormalizedValueScaleStop } from '../value-scale.ts';
import {
  chartChromeBlock,
  chartLayout,
  polarityForValue,
  seriesGlyph,
  usesSignedDomain,
  writeChartChrome
} from './support/chrome.ts';
import {
  chartMessageFactory,
  chartPointPosition,
  selectedChartPoint,
  yForValue
} from './support/interaction.ts';
import { frameBufferBlock } from './support/render-block.ts';
import {
  type ProjectedChartPoint,
  chartPointStyle,
  chartSeries,
  chartSeriesScale,
  projectChartSeries
} from './support/series.ts';
import { cleanLabel, rangeFor } from './support/values.ts';

export function chartBlock(
  renderNode: ChartNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const series = chartSeries(renderNode.props.series);
  const points = series.flatMap((item) => item.points);
  const state = chartStateBlock(renderNode, 'chart', theme, {
    empty: points.length === 0,
    emptyText: chartStateDescription(renderNode, 'No chart data'),
    loadingText: cleanLabel(renderNode.props.loadingText),
    errorText: cleanLabel(renderNode.props.errorText)
  });
  if (state !== undefined) return state;
  if (node.bounds.height <= 0 || node.bounds.width <= 0) return { lines: [] };
  const layout = chartLayout(renderNode, node.bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) {
    return chartChromeBlock(renderNode, node.bounds.width, widthProfile);
  }
  const range = rangeFor(points, numberProp(renderNode, 'min'), numberProp(renderNode, 'max'));
  const widgetScale = normalizeValueScale(renderNode.props.valueScale);
  const buffer = createFrameBuffer(node.bounds.width, node.bounds.height, { widthProfile });
  writeChartChrome(buffer, renderNode, node.bounds.width, widthProfile);
  const canvas = createCanvas2D(buffer, {
    row: layout.plotRow,
    column: 1,
    width: layout.plotWidth,
    height: layout.plotHeight
  });
  if (usesSignedDomain(renderNode) && range.min < 0 && range.max > 0) {
    canvas.line(0, yForValue(0, range, layout.plotHeight), Math.max(0, layout.plotWidth - 1), yForValue(0, range, layout.plotHeight), chartSpan(
      renderNode,
      'chart',
      'baseline',
      'baseline.zero',
      oneCellGlyph('─', '-', { widthProfile }),
      chartBaselineStyle(renderNode)
    ));
  }
  for (const [seriesIndex, item] of series.entries()) {
    const visible = projectChartSeries(renderNode, item, layout.plotWidth);
    const glyph = oneCellGlyph(
      seriesGlyph(item),
      item.kind === 'area' || item.kind === 'bar' ? '#' : '*',
      { widthProfile }
    );
    const seriesStyle = chartSeriesStyle(renderNode, seriesIndex);
    const seriesScale = chartSeriesScale(item, widgetScale);
    if (item.kind === 'area' || item.kind === 'bar') {
      drawFilledChartSeries(canvas, renderNode, item, visible, range, layout.plotHeight, glyph, seriesStyle, seriesScale, usesSignedDomain(renderNode));
    } else if (item.kind === 'scatter') {
      visible.forEach((projected) => {
        const signed = usesSignedDomain(renderNode);
        const polarity = polarityForValue(projected.value);
        canvas.point(
          projected.column,
          yForValue(projected.value, range, layout.plotHeight),
          chartSpan(
            renderNode,
            'chart',
            'point',
            signed ? `series.${item.id}.${polarity}.point` : `series.${item.id}.point`,
            glyph,
            chartPointStyle(projected.value, range, seriesScale, signed ? chartPolarityStyle(renderNode, polarity) : seriesStyle)
          )
        );
      });
    } else if (usesSignedDomain(renderNode) || seriesScale.length > 0) {
      drawSegmentedChartLine(canvas, renderNode, item, visible, range, layout.plotHeight, glyph, seriesStyle, seriesScale, usesSignedDomain(renderNode));
    } else {
      drawLineSeries(canvas, visible.map((projected) => ({ x: projected.column, y: projected.value })), {
        yScale: { domain: [range.min, range.max], range: [layout.plotHeight - 1, 0] },
        span: chartSpan(renderNode, 'chart', 'line', `series.${item.id}.line`, glyph, seriesStyle)
      });
    }
  }
  const selected = selectedChartPoint(renderNode, series);
  if (selected !== undefined) {
    const position = chartPointPosition(renderNode, node.bounds, selected.series, selected.point, range);
    if (position !== undefined) {
      buffer.write(position.row, position.column, [
        chartSpan(
          renderNode,
          'chart',
          'selected',
          `selection.${selected.series}.${String(selected.point)}`,
          oneCellGlyph('◆', '*', { widthProfile }),
          chartSelectedStyle(renderNode)
        )
      ]);
    }
  }
  return frameBufferBlock(buffer, node.bounds.width, node.bounds.height);
}

function drawFilledChartSeries(
  canvas: ReturnType<typeof createCanvas2D>,
  renderNode: ChartNode,
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
        renderNode,
        'chart',
        kind,
        signed ? `series.${item.id}.${polarity}.${kind}` : `series.${item.id}.${kind}`,
        glyph,
        chartPointStyle(projected.value, range, scale, signed ? chartPolarityStyle(renderNode, polarity) : fallback)
      )
    });
  }
}

function drawSegmentedChartLine(
  canvas: ReturnType<typeof createCanvas2D>,
  renderNode: ChartNode,
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
      renderNode,
      'chart',
      'point',
      signed ? `series.${item.id}.${polarity}.point` : `series.${item.id}.point`,
      glyph,
      chartPointStyle(projected.value, range, scale, signed ? chartPolarityStyle(renderNode, polarity) : fallback)
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
        renderNode,
        'chart',
        'line',
        signed ? `series.${item.id}.${polarity}.line` : `series.${item.id}.line`,
        glyph,
        chartPointStyle(current.value, range, scale, signed ? chartPolarityStyle(renderNode, polarity) : fallback)
      )
    });
  }
}

export function chartText(
  renderNode: ChartNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return chartTextFromBlock(chartBlock(renderNode, node, theme, widthProfile));
}

export function chartAccessibleBase(renderNode: ChartNode, id: string): AccessibleNode {
  const series = chartSeries(renderNode.props.series);
  return {
    id,
    role: 'text',
    label: id,
    description: `${String(series.length)} chart series.`
  };
}

export function chartAccessibleChildren(renderNode: ChartNode): readonly AccessibleNode[] {
  const series = chartSeries(renderNode.props.series);
  const selected = selectedChartPoint(renderNode, series);
  return series.map((item) => ({
    id: `${renderNode.id ?? 'chart'}:${item.id}`,
    role: 'text',
    label: item.label ?? item.id,
    value: `${String(item.points.length)} points`,
    ...(selected?.series === item.id
      ? { description: `Selected point ${String(selected.point + 1)} of ${String(item.points.length)}.` }
      : {})
  }));
}

export function chartHitTargets<TMessage>(renderNode: ChartNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = chartMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const series = chartSeries(renderNode.props.series);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0) return [];
  const range = rangeFor(points, numberProp(renderNode, 'min'), numberProp(renderNode, 'max'));
  const layout = chartLayout(renderNode, bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) return [];
  return series.flatMap((item) => projectChartSeries(renderNode, item, layout.plotWidth).flatMap((projected): HitTarget<TMessage>[] => {
    const row = bounds.row + layout.plotRow - 1 + yForValue(projected.value, range, layout.plotHeight);
    const column = bounds.column + projected.column;
    return [{
      id: `${renderNode.id ?? 'chart'}:${item.id}:${String(projected.column)}`,
      bounds: { row, column, width: 1, height: 1 },
      message: () => toMessage({
        kind: 'select',
        series: item.id,
        point: projected.point
      }),
      cursor: 'pointer'
    }];
  }));
}
type ChartNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'chart'>;
