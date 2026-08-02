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
import { paginatorAccessibleBase, paginatorBlock, paginatorHitTargets } from '../data-rendering.ts';
import {
  logViewerAccessibleBase,
  logViewerAccessibleChildren,
  logViewerBlock,
  logViewerPointerAnchor
} from '../log-viewer.ts';
import { tableAccessibleBase, tableAccessibleChildren, tableBlock, tableHitTargets } from '../table.ts';
import { treeAccessibleBase, treeAccessibleChildren, treeBlock, treeHitTargets } from '../tree.ts';
import { writeRenderBlock } from './support/block.ts';
import { pointerSelectionHitTargets } from '../text-pointer.ts';
import type { PointerSelectionAction } from '../../../interaction/text-pointer.ts';
import type { LogViewerBodyAnchor } from '../../../ui-model/log-viewer.ts';
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
  logViewerScrollbarState,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode,
  tableScrollbarState,
  treeScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';
import { dataMeasurements } from './data-measurements.ts';

export const dataRenderers = {
  sparkline: {
    measure: dataMeasurements.sparkline,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, sparklineBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => sparklineAccessibleBase(renderNode, id)
  },
  barChart: {
    measure: dataMeasurements.barChart,
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
    measure: dataMeasurements.chart,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, chartBlock(renderNode, layoutNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...chartAccessibleBase(renderNode, id, focused),
      children: chartAccessibleChildren(renderNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, bounds }) => chartHitTargets(renderNode, bounds)
  },
  meter: {
    measure: dataMeasurements.meter,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, meterBlock(renderNode, theme, widthProfile));
    },
    accessibility: ({ renderNode, id }) => meterAccessibleBase(renderNode, id)
  },
  heatmap: {
    measure: dataMeasurements.heatmap,
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
    measure: dataMeasurements.list,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => listScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, listBlock(
        renderNode,
        scrollbars.contentBounds.height,
        theme,
        focus === 'self',
        scrollbars.contentBounds.width,
        widthProfile
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...listAccessibleNode(renderNode, layoutNode, id, focused),
      children: listAccessibleChildren(renderNode, layoutNode)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode)
      ? [focusTarget(bounds, listCursor(renderNode, bounds))]
      : [],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => listScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...listHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  table: {
    measure: dataMeasurements.table,
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
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode)
      ? [focusTarget(bounds)]
      : [],
    hitTargets: ({ renderNode, bounds, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => tableScrollbarState(renderNode, contentBounds), 'both');
      return [
        ...tableHitTargets(renderNode, scrollbars.contentBounds, widthProfile),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  tree: {
    measure: dataMeasurements.tree,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => treeScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, treeBlock(
        renderNode,
        scrollbars.contentBounds,
        theme,
        widthProfile,
        focus === 'self',
        true
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      ...treeAccessibleBase(renderNode, layoutNode.bounds, id, focused),
      children: treeAccessibleChildren(renderNode, layoutNode.bounds)
    }),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode)
      ? [focusTarget(bounds)]
      : [],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => treeScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...treeHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  paginator: {
    measure: dataMeasurements.paginator,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, paginatorBlock(renderNode, widthProfile));
    },
    accessibility: ({ renderNode, id, focused, widthProfile }) => paginatorAccessibleBase(renderNode, id, focused, widthProfile),
    focusTargets: ({ renderNode, bounds }) => renderNode.props.toActionMessage === undefined ? [] : [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => paginatorHitTargets(renderNode, bounds, widthProfile)
  },
  logViewer: {
    measure: dataMeasurements.logViewer,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        layoutNode.bounds,
        (contentBounds) => logViewerScrollbarState(renderNode, { bounds: contentBounds }, widthProfile),
        'vertical'
      );
      writeRenderBlock(buffer, scrollbars.contentBounds, logViewerBlock(
        renderNode,
        { ...layoutNode, bounds: scrollbars.contentBounds },
        widthProfile
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused, widthProfile }) => ({
      ...logViewerAccessibleBase(renderNode, layoutNode, id, focused, widthProfile),
      children: logViewerAccessibleChildren(renderNode, layoutNode, widthProfile)
    }),
    focusTargets: ({ renderNode, bounds }) => renderNode.props.toActionMessage === undefined
      ? []
      : [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => {
      const toActionMessage = renderNode.props.toActionMessage;
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        bounds,
        (contentBounds) => logViewerScrollbarState(renderNode, { bounds: contentBounds }, widthProfile),
        'vertical'
      );
      return [
        ...pointerSelectionHitTargets({
          id: `${renderNode.id ?? renderNode.kind}:text`,
          bounds: scrollbars.contentBounds,
          focusTargetId: 'self',
          toMessage: toActionMessage === undefined
            ? undefined
            : (action: PointerSelectionAction<LogViewerBodyAnchor>) =>
                toActionMessage({ kind: 'pointer', action }),
          positionAt: (event) => logViewerPointerAnchor(
            renderNode,
            { bounds: scrollbars.contentBounds },
            event,
            widthProfile
          )
        }),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  }
} satisfies RendererMap<'sparkline' | 'barChart' | 'chart' | 'meter' | 'heatmap' | 'list' | 'table' | 'tree' | 'paginator' | 'logViewer'>;
