import { createFrameBuffer } from '../../frame.ts';
import { blitFrameCell } from '../../frame-buffer.ts';
import { splitTracks } from '../../../geometry/layout.ts';
import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { FrameCell } from '../../frame.ts';
import type { Rect } from '../../contracts.ts';
import {
  childLayoutSizes,
  gridChildBounds,
  layoutFlowOptions,
  priorityFillLayoutSizes,
  splitPaneChildBounds
} from './support/layout.ts';
import {
  renderSplitPaneDividers,
  splitPaneAccessibleNode,
  splitPaneHitTargets
} from '../split-pane.ts';
import {
  drawScrollbars,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode,
  viewportScrollbarState
} from './support/scroll.ts';
import {
  drawViewportIndicators,
  viewportAccessibleDescription,
  viewportChildBounds,
  viewportIndicatorCellKey
} from './support/viewport.ts';
import type { StructuralRendererMap } from './types.ts';
import { layoutMeasurements } from './layout-measurements.ts';
import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import { flowChildBounds } from './support/flow.ts';

export const layoutRenderers = {
  row: {
    measure: layoutMeasurements.row,
    layout: ({ renderNode, bounds, measureChild }) => {
      const tracks = childLayoutSizes(renderNode, priorityFillLayoutSizes(renderNode.children ?? []));
      return splitTracks(
        bounds,
        'horizontal',
        tracks,
        layoutFlowOptions(renderNode),
        tracks.map((track, index) => track.kind === 'content' ? measureChild(index).preferredWidth : 0)
      );
    },
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  column: {
    measure: layoutMeasurements.column,
    layout: ({ renderNode, bounds, measureChild }) => {
      const tracks = childLayoutSizes(renderNode);
      return splitTracks(
        bounds,
        'vertical',
        tracks,
        layoutFlowOptions(renderNode),
        tracks.map((track, index) => track.kind === 'content' ? measureChild(index).preferredHeight : 0)
      );
    },
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  flow: {
    measure: layoutMeasurements.flow,
    layout: ({ renderNode, bounds, childCount, measureChild }) => flowChildBounds(
      bounds,
      renderNode.props.direction,
      finiteNonNegativeIntegerOrZero(renderNode.props.gap),
      finiteNonNegativeIntegerOrZero(renderNode.props.lineGap),
      Array.from({ length: childCount }, (_, index) => measureChild(index))
    ),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  measuredColumn: {
    clipChildren: true,
    measure: layoutMeasurements.measuredColumn,
    layout: ({ renderNode, bounds, measureChild }) => renderNode.props.entries.map((entry, index) => {
      const measuredRows = measureChild(index).preferredHeight;
      if (measuredRows !== entry.rows) {
        throw new RangeError(
          `measuredColumn() entry ${String(index)} declares ${String(entry.rows)} rows but its element measures ${String(measuredRows)}.`
        );
      }
      return {
        row: bounds.row + entry.rowOffset - entry.clippedRowsBefore,
        column: bounds.column,
        width: bounds.width,
        height: measuredRows
      };
    }),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  viewport: {
    clipChildren: true,
    measure: layoutMeasurements.viewport,
    layout: ({ renderNode, bounds, measureChild }) => [
      viewportChildBounds(renderNode, bounds, measureChild(0))
    ],
    render: (input) => {
      const viewportBuffer = createFrameBuffer(input.buffer.width, input.buffer.height, {
        widthProfile: input.buffer.widthProfile
      });
      input.renderChildren(viewportBuffer);
      const scrollbars = scrollbarsForRenderNode(
        input.renderNode,
        input.layoutNode.bounds,
        (contentBounds) => viewportScrollbarState(
          input.renderNode,
          contentBounds,
          input.layoutNode
        ),
        'both'
      );
      const occupiedCells = new Set<string>();
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, scrollbars.contentBounds)) {
          blitFrameCell(input.buffer, cell);
          occupiedCells.add(viewportIndicatorCellKey(cell.row, cell.column));
        }
      }
      drawViewportIndicators(
        input.buffer,
        input.renderNode,
        input.layoutNode,
        scrollbars.contentBounds,
        input.theme,
        occupiedCells
      );
      drawScrollbars(input.buffer, input.renderNode, scrollbars, input.theme);
    },
    accessibility: ({ renderNode, layoutNode, id }) => ({
      id,
      role: 'group',
      description: viewportAccessibleDescription(renderNode, layoutNode)
    }),
    hitTargets: ({ renderNode, bounds, layoutNode }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        bounds,
        (contentBounds) => viewportScrollbarState(
          renderNode,
          contentBounds,
          layoutNode
        ),
        'both'
      );
      return scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state);
    }
  },
  grid: {
    measure: layoutMeasurements.grid,
    layout: ({ renderNode, bounds, measureChild }) => gridChildBounds(renderNode, bounds, measureChild),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  splitPane: {
    measure: layoutMeasurements.splitPane,
    layout: ({ renderNode, bounds, measureChild }) => splitPaneChildBounds(renderNode, bounds, measureChild),
    render: (input) => {
      input.renderChildren();
      renderSplitPaneDividers(input.renderNode, input.layoutNode, input.buffer, input.theme, input.focus === 'self');
    },
    accessibility: ({ renderNode, id, focused }) => splitPaneAccessibleNode(renderNode, id, focused),
    hitTargets: ({ renderNode, layoutNode }) => splitPaneHitTargets(renderNode, layoutNode)
  },
} satisfies StructuralRendererMap<'column' | 'row' | 'flow' | 'measuredColumn' | 'viewport' | 'grid' | 'splitPane'>;

function groupAccessibleNode(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'group',
    ...(focused ? { focused } : {}),
  };
}

function cellInside(cell: FrameCell, bounds: Rect): boolean {
  return cell.row >= bounds.row
    && cell.row < bounds.row + bounds.height
    && cell.column >= bounds.column
    && cell.column < bounds.column + bounds.width;
}
