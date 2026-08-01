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
import type { Rect } from '../../../contracts.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../../../visual/render.ts';
import { chartSeries } from './series.ts';
import { clipLineSpans } from './render-block.ts';
import { cleanLabel } from './values.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';

type ChartNode = RenderNodeOfKind<unknown, 'chart'>;

export function chartLayout(renderNode: ChartNode, bounds: Rect): {
  readonly plotRow: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
} {
  const headerRows = chartHeaderRows(renderNode);
  const footerRows = cleanLabel(renderNode.props.xLabel).length > 0 ? 1 : 0;
  return {
    plotRow: 1 + headerRows,
    plotWidth: bounds.width,
    plotHeight: Math.max(0, bounds.height - headerRows - footerRows)
  };
}

export function writeChartLabels(
  buffer: ReturnType<typeof createFrameBuffer>,
  renderNode: ChartNode,
  width: number,
  widthProfile: TextWidthProfile
): void {
  chartHeaderBlock(renderNode, width, widthProfile).lines.forEach((line, index) => {
    buffer.write(index + 1, 1, line.spans);
  });
  const footer = chartFooterBlock(renderNode, width, widthProfile);
  if (footer.lines.length > 0) {
    buffer.write(buffer.height, 1, footer.lines[0]?.spans ?? []);
  }
}

export function chartLabelsBlock(renderNode: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
  return {
    lines: [
      ...chartHeaderBlock(renderNode, width, widthProfile).lines,
      ...chartFooterBlock(renderNode, width, widthProfile).lines
    ]
  };
}

export function seriesGlyph(series: ChartSeries): string {
  const glyph = cleanLabel(series.glyph);
  if (glyph.length > 0) return glyph.slice(0, 2);
  return series.kind === 'area' || series.kind === 'bar' ? '█' : '*';
}

export function usesSignedDomain(renderNode: ChartNode): boolean {
  return renderNode.props.signedDomain === true;
}

export function polarityForValue(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive';
}

function chartHeaderRows(renderNode: ChartNode): number {
  return (renderNode.props.legend === true ? 1 : 0) + (cleanLabel(renderNode.props.yLabel).length > 0 ? 1 : 0);
}

function chartHeaderBlock(renderNode: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
  const rows: RenderLine[] = [];
  if (renderNode.props.legend === true) {
    rows.push({
      spans: clipLineSpans(chartSeries(renderNode.props.series).flatMap((item, index): readonly RenderSpan[] => [
        ...(index === 0 ? [] : [
          chartSpan(
            renderNode,
            'chart',
            'separator',
            `legend.${item.id}.separator.beforeGlyph`,
            '  ',
            chartPlaceholderStyle(renderNode)
          )
        ]),
        chartSpan(renderNode, 'chart', 'legend', `legend.${item.id}.glyph`, seriesGlyph(item), chartSeriesStyle(renderNode, index)),
        chartSpan(
          renderNode,
          'chart',
          'separator',
          `legend.${item.id}.separator.beforeLabel`,
          ' ',
          chartPlaceholderStyle(renderNode)
        ),
        chartSpan(renderNode, 'chart', 'legend', `legend.${item.id}.label`, item.label, chartLabelStyle(renderNode))
      ]), width, widthProfile)
    });
  }
  const yLabel = cleanLabel(renderNode.props.yLabel);
  if (yLabel.length > 0) {
    rows.push({
      spans: clipLineSpans(
        [chartSpan(renderNode, 'chart', 'axis', 'axis.y.label', yLabel, chartAxisStyle(renderNode))],
        width,
        widthProfile
      )
    });
  }
  return { lines: rows };
}

function chartFooterBlock(renderNode: ChartNode, width: number, widthProfile: TextWidthProfile): RenderBlock {
  const xLabel = cleanLabel(renderNode.props.xLabel);
  return {
    lines: xLabel.length === 0
      ? []
      : [{
          spans: clipLineSpans(
            [chartSpan(renderNode, 'chart', 'axis', 'axis.x.label', xLabel, chartAxisStyle(renderNode))],
            width,
            widthProfile
          )
        }]
  };
}
