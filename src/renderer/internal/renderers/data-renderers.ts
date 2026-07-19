import {
  barChartAccessibleBase,
  barChartAccessibleChildren,
  barChartBlock,
  barChartHitTargets,
  chartAccessibleBase,
  chartAccessibleChildren,
  chartBlock,
  chartHitTargets,
  meterAccessibleBase,
  meterBlock,
  heatmapAccessibleBase,
  heatmapAccessibleChildren,
  heatmapBlock,
  heatmapHitTargets,
  sparklineAccessibleBase,
  sparklineBlock
} from '../charts/index.ts';
import { paginatorAccessibleBase, paginatorBlock, paginatorHitTargets } from '../data-widgets.ts';
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
  scrollbackBlock,
  scrollbackPointerOffset
} from '../scrollback.ts';
import { tableAccessibleBase, tableAccessibleChildren, tableBlock, tableHitTargets } from '../table.ts';
import { treeAccessibleBase, treeAccessibleChildren, treeBlock, treeHitTargets } from '../tree.ts';
import { writeRenderBlock } from './support/block.ts';
import { textPointerHitTargets } from '../text-pointer.ts';
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
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, barChartBlock(renderNode, layoutNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...barChartAccessibleBase(renderNode, layoutNode, id, focused),
      children: barChartAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => barChartHitTargets(renderNode, bounds)
  },
  chart: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, chartBlock(renderNode, layoutNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, id }) => ({
      ...chartAccessibleBase(renderNode, id),
      children: chartAccessibleChildren(renderNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => chartHitTargets(renderNode, bounds)
  },
  meter: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, meterBlock(renderNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, id }) => meterAccessibleBase(renderNode, id)
  },
  heatmap: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, heatmapBlock(renderNode, layoutNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...heatmapAccessibleBase(renderNode, layoutNode, id, focused),
      children: heatmapAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => heatmapHitTargets(renderNode, bounds)
  },
  list: {
    render: ({ renderNode, layoutNode, buffer, theme, focus }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => listScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, listBlock(renderNode, scrollbars.contentBounds.height, theme, focus === 'self'));
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
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => tableScrollbarState(renderNode, contentBounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, tableBlock(
        renderNode,
        scrollbars.contentBounds,
        theme,
        widthProfile,
        focus === 'self'
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused, widthProfile }) => ({
      ...tableAccessibleBase(renderNode, layoutNode.bounds, id, focused, widthProfile),
      children: tableAccessibleChildren(renderNode, layoutNode.bounds, widthProfile)
    }),
    hitTargets: ({ renderNode, bounds, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => tableScrollbarState(renderNode, contentBounds), 'both');
      return [
        ...tableHitTargets(renderNode, scrollbars.contentBounds, widthProfile),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  tree: {
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => treeScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, treeBlock(
        renderNode,
        scrollbars.contentBounds,
        theme,
        widthProfile,
        focus === 'self'
      ));
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
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, paginatorBlock(renderNode, widthProfile));
    },
    accessibility: ({ renderNode, id, focused, widthProfile }) => paginatorAccessibleBase(renderNode, id, focused, widthProfile),
    focusTargets: ({ renderNode, bounds }) => renderNode.props.toActionMessage === undefined ? [] : [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => paginatorHitTargets(renderNode, bounds, widthProfile)
  },
  scrollback: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        layoutNode.bounds,
        (contentBounds) => scrollbackScrollbarState(renderNode, { bounds: contentBounds }, widthProfile),
        'vertical'
      );
      writeRenderBlock(buffer, scrollbars.contentBounds, scrollbackBlock(
        renderNode,
        { ...layoutNode, bounds: scrollbars.contentBounds },
        widthProfile
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, widthProfile }) => ({
      ...scrollbackAccessibleBase(renderNode, layoutNode, id, widthProfile),
      children: scrollbackAccessibleChildren(renderNode, layoutNode, widthProfile)
    }),
    focusTargets: ({ renderNode, bounds }) => renderNode.props.toActionMessage === undefined
      ? []
      : [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        bounds,
        (contentBounds) => scrollbackScrollbarState(renderNode, { bounds: contentBounds }, widthProfile),
        'vertical'
      );
      return [
        ...textPointerHitTargets({
          id: `${renderNode.id ?? renderNode.kind}:text`,
          bounds: scrollbars.contentBounds,
          focusTargetId: 'self',
          toMessage: renderNode.props.toActionMessage === undefined
            ? undefined
            : (action) => renderNode.props.toActionMessage?.({ kind: 'pointer', action }),
          offsetAt: (event) => scrollbackPointerOffset(
            renderNode,
            { bounds: scrollbars.contentBounds },
            event,
            widthProfile
          )
        }),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  structuredBlock: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, structuredBlockBlock(
        renderNode,
        layoutNode,
        theme,
        widthProfile
      ));
    },
    accessibility: ({ renderNode, id }) => structuredBlockAccessibleBase(renderNode, id)
  },
  activityFeed: {
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, activityFeedBlock(
        renderNode,
        layoutNode,
        theme,
        widthProfile
      ));
    },
    accessibility: ({ renderNode, layoutNode, id, focused, theme, widthProfile }) => ({
      ...activityFeedAccessibleBase(renderNode, layoutNode, id, focused, theme, widthProfile),
      children: activityFeedAccessibleChildren(renderNode, layoutNode, theme, widthProfile)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => activityFeedHitTargets(
      renderNode,
      bounds,
      theme,
      widthProfile
    )
  }
} satisfies RendererMap<'sparkline' | 'barChart' | 'chart' | 'meter' | 'heatmap' | 'list' | 'table' | 'tree' | 'paginator' | 'scrollback' | 'structuredBlock' | 'activityFeed'>;
