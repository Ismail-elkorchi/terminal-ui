import type { ChartSeries } from '../../../../ui-model/feedback.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import {
  chartAxisStyle,
  chartLabelStyle,
  chartPlaceholderStyle,
  chartSeriesStyle,
  chartSpan
} from '../../chart-visual.ts';
import { createFrameBuffer } from '../../frame-buffer.ts';
import type { Rect } from '../../../model/layout.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../../../visual/render.ts';
import { chartSeries } from './series.ts';
import { clipLineSpans } from './render-block.ts';
import { cleanLabel } from './values.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';

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
  width: number,
  widthProfile: TextWidthProfile
): void {
  chartHeaderBlock(widget, width, widthProfile).lines.forEach((line, index) => {
    buffer.write(index + 1, 1, line.spans);
  });
  const footer = chartFooterBlock(widget, width, widthProfile);
  if (footer.lines.length > 0) {
    buffer.write(buffer.height, 1, footer.lines[0]?.spans ?? []);
  }
}

export function chartChromeBlock(widget: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
  return {
    lines: [
      ...chartHeaderBlock(widget, width, widthProfile).lines,
      ...chartFooterBlock(widget, width, widthProfile).lines
    ]
  };
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

function chartHeaderBlock(widget: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
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
      ]), width, widthProfile)
    });
  }
  const yLabel = cleanLabel(widget.props.yLabel);
  if (yLabel.length > 0) {
    rows.push({
      spans: clipLineSpans(
        [chartSpan(widget, 'chart', 'axis', 'axis.y.label', yLabel, chartAxisStyle(widget))],
        width,
        widthProfile
      )
    });
  }
  return { lines: rows };
}

function chartFooterBlock(widget: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
  const xLabel = cleanLabel(widget.props.xLabel);
  return {
    lines: xLabel.length === 0
      ? []
      : [{
          spans: clipLineSpans(
            [chartSpan(widget, 'chart', 'axis', 'axis.x.label', xLabel, chartAxisStyle(widget))],
            width,
            widthProfile
          )
        }]
  };
}
