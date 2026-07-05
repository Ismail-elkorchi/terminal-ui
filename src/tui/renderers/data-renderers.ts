import {
  barChartAccessibleBase,
  barChartAccessibleChildren,
  barChartBlock,
  chartAccessibleBase,
  chartAccessibleChildren,
  chartBlock,
  chartHitTargets,
  gaugeAccessibleBase,
  gaugeBlock,
  heatmapAccessibleBase,
  heatmapAccessibleChildren,
  heatmapBlock,
  heatmapHitTargets,
  sparklineAccessibleBase,
  sparklineBlock
} from '../chart-widgets.ts';
import { paginatorAccessibleBase, paginatorBlock } from '../data-widgets.ts';
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
import { tableAccessibleBase, tableAccessibleChildren, tableBlock, tableHitTargets } from '../table.ts';
import { treeAccessibleBase, treeAccessibleChildren, treeBlock, treeHitTargets } from '../tree.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import {
  listAccessibleChildren,
  listAccessibleNode,
  listBlock,
  listCursor,
  listHitTargets,
  listScrollbarState
} from './support/list.ts';
import {
  drawScrollbars,
  scrollbackScrollbarState,
  scrollbarHitTargetsForWidget,
  scrollbarsForWidget,
  tableScrollbarState,
  treeScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';

export const dataRenderers = {
  sparkline: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, sparklineBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => sparklineAccessibleBase(widget, id)
  },
  barChart: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, barChartBlock(widget, node, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...barChartAccessibleBase(widget, node, id, focused),
      children: barChartAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  chart: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, chartBlock(widget, node, theme));
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
      writeRenderBlock(buffer, node.bounds, gaugeBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => gaugeAccessibleBase(widget, id)
  },
  heatmap: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, heatmapBlock(widget, node, theme));
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
      const scrollbars = scrollbarsForWidget(widget, node.bounds, (contentBounds) => listScrollbarState(widget, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, listBlock(widget, scrollbars.contentBounds.height, theme));
      drawScrollbars(buffer, widget, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...listAccessibleNode(widget, node, id, focused),
      children: listAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, listCursor(widget, bounds))],
    hitTargets: ({ widget, bounds }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => listScrollbarState(widget, contentBounds), 'vertical');
      return [
        ...listHitTargets(widget, scrollbars.contentBounds),
        ...scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state)
      ];
    }
  },
  table: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, (contentBounds) => tableScrollbarState(widget, contentBounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, tableBlock(widget, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, widget, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...tableAccessibleBase(widget, node.bounds, id, focused),
      children: tableAccessibleChildren(widget, node.bounds)
    }),
    hitTargets: ({ widget, bounds }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => tableScrollbarState(widget, contentBounds), 'both');
      return [
        ...tableHitTargets(widget, scrollbars.contentBounds),
        ...scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state)
      ];
    }
  },
  tree: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, (contentBounds) => treeScrollbarState(widget, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, treeBlock(widget, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, widget, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...treeAccessibleBase(widget, node.bounds, id, focused),
      children: treeAccessibleChildren(widget, node.bounds)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => treeScrollbarState(widget, contentBounds), 'vertical');
      return [
        ...treeHitTargets(widget, scrollbars.contentBounds),
        ...scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state)
      ];
    }
  },
  paginator: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, paginatorBlock(widget));
    },
    accessibility: ({ widget, id }) => paginatorAccessibleBase(widget, id)
  },
  scrollback: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, (contentBounds) => scrollbackScrollbarState(widget, { bounds: contentBounds }), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, scrollbackBlock(widget, { ...node, bounds: scrollbars.contentBounds }));
      drawScrollbars(buffer, widget, scrollbars, theme);
    },
    accessibility: ({ widget, node, id }) => ({
      ...scrollbackAccessibleBase(widget, node, id),
      children: scrollbackAccessibleChildren(widget, node)
    }),
    hitTargets: ({ widget, bounds }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => scrollbackScrollbarState(widget, { bounds: contentBounds }), 'vertical');
      return scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state);
    }
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
