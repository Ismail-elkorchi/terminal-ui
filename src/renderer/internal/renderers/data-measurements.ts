import { scrollbackHistoryItemAt } from '../../../ui-model/scrollback-history.ts';
import { barChartText, chartText, meterText, heatmapText, sparklineText } from '../charts/index.ts';
import { paginatorText } from '../data-widgets.ts';
import { measureBlock, measureSize, measureText } from '../measurement.ts';
import { activityFeedBlock, structuredBlockBlock } from '../structured-block.ts';
import { treeBlock } from '../tree.ts';
import { tableIntrinsicSize } from '../table/columns.ts';
import { isRecord } from './support/common.ts';
import { listIntrinsicMeasurement } from './support/list.ts';
import {
  boundedMeasureSize,
  constrainedMeasureBounds,
  measurementLayoutNode,
  visualMeasureBounds
} from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';

export const dataMeasurements = {
  sparkline: ({ renderNode, theme, widthProfile }) => measureText(sparklineText(renderNode, theme), { widthProfile }),
  barChart: ({ renderNode, bounds, theme, widthProfile }) => measureText(
    barChartText(renderNode, measurementLayoutNode(renderNode, visualMeasureBounds(bounds)), theme, widthProfile),
    { widthProfile }
  ),
  chart: ({ renderNode, bounds, theme, widthProfile }) => measureText(
    chartText(renderNode, measurementLayoutNode(renderNode, visualMeasureBounds(bounds)), theme, widthProfile),
    { widthProfile }
  ),
  meter: ({ renderNode, theme, widthProfile }) => measureText(
    meterText(renderNode, theme, widthProfile),
    { widthProfile }
  ),
  heatmap: ({ renderNode, bounds, theme, widthProfile }) => measureText(
    heatmapText(renderNode, measurementLayoutNode(renderNode, visualMeasureBounds(bounds)), theme, widthProfile),
    { widthProfile }
  ),
  list: ({ renderNode, theme, widthProfile }) => listIntrinsicMeasurement(renderNode, theme, widthProfile),
  table: ({ renderNode, widthProfile }) => {
    const size = tableIntrinsicSize(renderNode, widthProfile);
    return measureSize(size.width, size.height);
  },
  tree: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    treeBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  paginator: ({ renderNode, widthProfile }) => measureText(paginatorText(renderNode, widthProfile), { widthProfile }),
  scrollback: ({ renderNode, widthProfile }) => measureText(scrollbackMeasureText(renderNode), { widthProfile }),
  structuredBlock: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    structuredBlockBlock(
      renderNode,
      measurementLayoutNode(renderNode, constrainedMeasureBounds(bounds)),
      theme,
      widthProfile
    ),
    { widthProfile }
  ),
  activityFeed: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    activityFeedBlock(
      renderNode,
      measurementLayoutNode(renderNode, constrainedMeasureBounds(bounds)),
      theme,
      widthProfile
    ),
    { widthProfile }
  )
} satisfies RendererMeasurementMap<
  | 'sparkline'
  | 'barChart'
  | 'chart'
  | 'meter'
  | 'heatmap'
  | 'list'
  | 'table'
  | 'tree'
  | 'paginator'
  | 'scrollback'
  | 'structuredBlock'
  | 'activityFeed'
>;

function scrollbackMeasureText(renderNode: RenderNodeOfKind<unknown, 'scrollback'>): string {
  const history = renderNode.props.history;
  const scroll = isRecord(renderNode.props.scroll) ? renderNode.props.scroll : undefined;
  const viewportRows = boundedMeasureSize(
    typeof scroll?.viewportRows === 'number' ? scroll.viewportRows : 0,
    1,
    200
  );
  const offset = typeof scroll?.offsetRow === 'number'
    ? Math.max(0, Math.floor(scroll.offsetRow))
    : Math.max(0, history.itemCount - viewportRows);
  return Array.from({ length: viewportRows + 1 }, (_value, index) =>
    scrollbackHistoryItemAt(history, offset + index)?.bodyText ?? ''
  ).join('\n');
}
