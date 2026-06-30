import {
  barChartAccessibleBase,
  barChartAccessibleChildren,
  barChartText,
  chartAccessibleBase,
  chartAccessibleChildren,
  chartHitTargets,
  chartText,
  gaugeAccessibleBase,
  gaugeText,
  heatmapAccessibleBase,
  heatmapAccessibleChildren,
  heatmapHitTargets,
  heatmapText,
  sparklineAccessibleBase,
  sparklineText
} from '../chart-widgets.ts';
import { paginatorAccessibleBase, paginatorText } from '../data-widgets.ts';
import {
  activityFeedAccessibleBase,
  activityFeedAccessibleChildren,
  activityFeedBlock,
  structuredBlockAccessibleBase,
  structuredBlockBlock
} from '../structured-block.ts';
import {
  scrollbackAccessibleBase,
  scrollbackAccessibleChildren,
  scrollbackBlock
} from '../scrollback.ts';
import { tableAccessibleBase, tableAccessibleChildren, tableBlock } from '../table.ts';
import { treeAccessibleBase, treeAccessibleChildren, treeBlock, treeHitTargets } from '../tree.ts';
import { writeBlock, writeRenderBlock } from './support/block.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import {
  listAccessibleChildren,
  listAccessibleNode,
  listCursor,
  listHitTargets,
  listScrollbarState,
  listText
} from './support/list.ts';
import {
  drawScrollbars,
  scrollbackScrollbarState,
  scrollbarsForWidget,
  tableScrollbarState,
  treeScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';

export const dataRenderers = {
  sparkline: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, sparklineText(widget));
    },
    accessibility: ({ widget, id }) => sparklineAccessibleBase(widget, id)
  },
  barChart: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, barChartText(widget, node, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...barChartAccessibleBase(widget, node, id, focused),
      children: barChartAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  chart: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, chartText(widget, node));
    },
    accessibility: ({ widget, id }) => ({
      ...chartAccessibleBase(widget, id),
      children: chartAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : [],
    hitTargets: ({ widget, bounds }) => chartHitTargets(widget, bounds)
  },
  gauge: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, gaugeText(widget, theme));
    },
    accessibility: ({ widget, id }) => gaugeAccessibleBase(widget, id)
  },
  heatmap: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, heatmapText(widget, node));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...heatmapAccessibleBase(widget, node, id, focused),
      children: heatmapAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : [],
    hitTargets: ({ widget, bounds }) => heatmapHitTargets(widget, bounds)
  },
  list: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, listScrollbarState(widget, node.bounds), 'vertical');
      writeBlock(buffer, scrollbars.contentBounds, listText(widget, scrollbars.contentBounds.height, theme));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...listAccessibleNode(widget, node, id, focused),
      children: listAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, listCursor(widget, bounds))],
    hitTargets: ({ widget, bounds }) => listHitTargets(widget, bounds)
  },
  table: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, tableScrollbarState(widget, node.bounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, tableBlock(widget, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...tableAccessibleBase(widget, node.bounds, id, focused),
      children: tableAccessibleChildren(widget, node.bounds)
    })
  },
  tree: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, treeScrollbarState(widget, node.bounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, treeBlock(widget, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...treeAccessibleBase(widget, node.bounds, id, focused),
      children: treeAccessibleChildren(widget, node.bounds)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => treeHitTargets(widget, bounds)
  },
  paginator: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, paginatorText(widget));
    },
    accessibility: ({ widget, id }) => paginatorAccessibleBase(widget, id)
  },
  scrollback: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, scrollbackScrollbarState(widget, node), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, scrollbackBlock(widget, { ...node, bounds: scrollbars.contentBounds }));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, node, id }) => ({
      ...scrollbackAccessibleBase(widget, node, id),
      children: scrollbackAccessibleChildren(widget, node)
    })
  },
  structuredBlock: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, structuredBlockBlock(widget, node, theme));
    },
    accessibility: ({ widget, id }) => structuredBlockAccessibleBase(widget, id)
  },
  activityFeed: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, activityFeedBlock(widget, node, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...activityFeedAccessibleBase(widget, node, id, focused),
      children: activityFeedAccessibleChildren(widget, node)
    })
  }
} satisfies RendererMap<'sparkline' | 'barChart' | 'chart' | 'gauge' | 'heatmap' | 'list' | 'table' | 'tree' | 'paginator' | 'scrollback' | 'structuredBlock' | 'activityFeed'>;
