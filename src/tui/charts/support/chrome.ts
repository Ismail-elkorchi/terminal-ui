import type { ChartSeries } from '../../../ui-model/options/feedback.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
import {
  chartAxisStyle,
  chartLabelStyle,
  chartPlaceholderStyle,
  chartSeriesStyle,
  chartSpan
} from '../../chart-visual.ts';
import { createFrameBuffer } from '../../frame-buffer.ts';
import type { Rect } from '../../layout.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../render-primitives.ts';
import { chartSeries } from './series.ts';
import { clipLineSpans } from './render-block.ts';
import { cleanLabel } from './values.ts';

type ChartNode = RenderNodeOfKind<unknown, 'chart'>;

export function chartLayout(widget: ChartNode, bounds: Rect): {
  readonly plotRow: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
} {
  const headerRows = chartHeaderRows(widget);
  const footerRows = cleanLabel(widget.props.xLabel).length > 0 ? 1 : 0;
  return {
    plotRow: 1 + headerRows,
    plotWidth: bounds.width,
    plotHeight: Math.max(0, bounds.height - headerRows - footerRows)
  };
}

export function writeChartChrome(
  buffer: ReturnType<typeof createFrameBuffer>,
  widget: ChartNode,
  width: number
): void {
  chartHeaderBlock(widget, width).lines.forEach((line, index) => {
    buffer.write(index + 1, 1, line.spans);
  });
  const footer = chartFooterBlock(widget, width);
  if (footer.lines.length > 0) {
    buffer.write(buffer.height, 1, footer.lines[0]?.spans ?? []);
  }
}

export function chartChromeBlock(widget: ChartNode, width: number): RenderBlock {
  return { lines: [...chartHeaderBlock(widget, width).lines, ...chartFooterBlock(widget, width).lines] };
}

export function seriesGlyph(series: ChartSeries): string {
  const glyph = cleanLabel(series.glyph);
  if (glyph.length > 0) return glyph.slice(0, 2);
  return series.kind === 'area' || series.kind === 'bar' ? '█' : '*';
}

export function usesSignedDomain(widget: ChartNode): boolean {
  return widget.props.signedDomain === true;
}

export function polarityForValue(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive';
}

function chartHeaderRows(widget: ChartNode): number {
  return (widget.props.legend === true ? 1 : 0) + (cleanLabel(widget.props.yLabel).length > 0 ? 1 : 0);
}

function chartHeaderBlock(widget: ChartNode, width: number): RenderBlock {
  const rows: RenderLine[] = [];
  if (widget.props.legend === true) {
    rows.push({
      spans: clipLineSpans(chartSeries(widget.props.series).flatMap((item, index): readonly RenderSpan[] => [
        ...(index === 0 ? [] : [
          chartSpan(
            widget,
            'chart',
            'separator',
            `legend.${item.id}.separator.beforeGlyph`,
            '  ',
            chartPlaceholderStyle(widget)
          )
        ]),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.glyph`, seriesGlyph(item), chartSeriesStyle(widget, index)),
        chartSpan(
          widget,
          'chart',
          'separator',
          `legend.${item.id}.separator.beforeLabel`,
          ' ',
          chartPlaceholderStyle(widget)
        ),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.label`, item.label ?? item.id, chartLabelStyle(widget))
      ]), width)
    });
  }
  const yLabel = cleanLabel(widget.props.yLabel);
  if (yLabel.length > 0) {
    rows.push({
      spans: [chartSpan(widget, 'chart', 'axis', 'axis.y.label', yLabel.slice(0, width), chartAxisStyle(widget))]
    });
  }
  return { lines: rows };
}

function chartFooterBlock(widget: ChartNode, width: number): RenderBlock {
  const xLabel = cleanLabel(widget.props.xLabel);
  return {
    lines: xLabel.length === 0
      ? []
      : [{
          spans: [chartSpan(widget, 'chart', 'axis', 'axis.x.label', xLabel.slice(0, width), chartAxisStyle(widget))]
        }]
  };
}
