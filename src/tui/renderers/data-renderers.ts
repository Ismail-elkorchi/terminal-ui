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
  activityFeedHitTargets,
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
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode,
  tableScrollbarState,
  treeScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';

export const dataRenderers = {
  sparkline: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, sparklineBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => sparklineAccessibleBase(renderNode, id)
  },
  barChart: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, barChartBlock(renderNode, layoutNode, theme));
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...barChartAccessibleBase(renderNode, layoutNode, id, focused),
      children: barChartAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : []
  },
  chart: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, chartBlock(renderNode, layoutNode, theme));
    },
    accessibility: ({ renderNode, id }) => ({
      ...chartAccessibleBase(renderNode, id),
      children: chartAccessibleChildren(renderNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => chartHitTargets(renderNode, bounds)
  },
  gauge: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, gaugeBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => gaugeAccessibleBase(renderNode, id)
  },
  heatmap: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, heatmapBlock(renderNode, layoutNode, theme));
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...heatmapAccessibleBase(renderNode, layoutNode, id, focused),
      children: heatmapAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => heatmapHitTargets(renderNode, bounds)
  },
  list: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => listScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, listBlock(renderNode, scrollbars.contentBounds.height, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...listAccessibleNode(renderNode, layoutNode, id, focused),
      children: listAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, listCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => listScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...listHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  table: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => tableScrollbarState(renderNode, contentBounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, tableBlock(renderNode, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...tableAccessibleBase(renderNode, layoutNode.bounds, id, focused),
      children: tableAccessibleChildren(renderNode, layoutNode.bounds)
    }),
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => tableScrollbarState(renderNode, contentBounds), 'both');
      return [
        ...tableHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  tree: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => treeScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, treeBlock(renderNode, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...treeAccessibleBase(renderNode, layoutNode.bounds, id, focused),
      children: treeAccessibleChildren(renderNode, layoutNode.bounds)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => treeScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...treeHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  paginator: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, paginatorBlock(renderNode));
    },
    accessibility: ({ renderNode, id }) => paginatorAccessibleBase(renderNode, id)
  },
  scrollback: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => scrollbackScrollbarState(renderNode, { bounds: contentBounds }), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, scrollbackBlock(renderNode, { ...layoutNode, bounds: scrollbars.contentBounds }));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id }) => ({
      ...scrollbackAccessibleBase(renderNode, layoutNode, id),
      children: scrollbackAccessibleChildren(renderNode, layoutNode)
    }),
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => scrollbackScrollbarState(renderNode, { bounds: contentBounds }), 'vertical');
      return scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state);
    }
  },
  structuredBlock: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, structuredBlockBlock(renderNode, layoutNode, theme));
    },
    accessibility: ({ renderNode, id }) => structuredBlockAccessibleBase(renderNode, id)
  },
  activityFeed: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, activityFeedBlock(renderNode, layoutNode, theme));
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...activityFeedAccessibleBase(renderNode, layoutNode, id, focused),
      children: activityFeedAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds, theme }) => activityFeedHitTargets(renderNode, bounds, theme)
  }
} satisfies RendererMap<'sparkline' | 'barChart' | 'chart' | 'gauge' | 'heatmap' | 'list' | 'table' | 'tree' | 'paginator' | 'scrollback' | 'structuredBlock' | 'activityFeed'>;
