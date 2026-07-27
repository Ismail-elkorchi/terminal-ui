import { createFrameBuffer } from '../frame.ts';
import { blitFrameCell } from '../frame-buffer.ts';
import { splitTracks } from '../layout-geometry.ts';
import { writeRenderBlock } from './support/block.ts';
import { borderForDialog, dialogLabel } from './support/border.ts';
import { cellInside, groupAccessibleNode } from './support/common.ts';
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
import { tabsAccessibleChildren, tabsChildBounds, tabsHeaderBlock, tabsHitTargets } from './support/tabs.ts';
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
import { dialogBounds, dialogChildBounds, dialogOutsideHitTargets, drawDialogActionSeparator } from './support/dialog.ts';
import { drawSurfaceFrame } from '../surface.ts';
import type { RendererMap } from './types.ts';
import { layoutMeasurements } from './layout-measurements.ts';

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
  viewport: {
    measure: layoutMeasurements.viewport,
    layout: ({ renderNode, bounds }) => [viewportChildBounds(renderNode, bounds)],
    render: (input) => {
      const viewportBuffer = createFrameBuffer(input.buffer.width, input.buffer.height, {
        widthProfile: input.buffer.widthProfile
      });
      input.renderChildren(viewportBuffer);
      const scrollbars = scrollbarsForRenderNode(input.renderNode, input.layoutNode.bounds, (contentBounds) => viewportScrollbarState(input.renderNode, contentBounds), 'both');
      const occupiedCells = new Set<string>();
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, scrollbars.contentBounds)) {
          blitFrameCell(input.buffer, cell);
          occupiedCells.add(viewportIndicatorCellKey(cell.row, cell.column));
        }
      }
      drawViewportIndicators(input.buffer, input.renderNode, scrollbars.contentBounds, input.theme, occupiedCells);
      drawScrollbars(input.buffer, input.renderNode, scrollbars, input.theme);
    },
    accessibility: ({ renderNode, layoutNode, id }) => ({
      id,
      role: 'text',
      label: id,
      description: viewportAccessibleDescription(renderNode, layoutNode)
    }),
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => viewportScrollbarState(renderNode, contentBounds), 'both');
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
  tabs: {
    measure: layoutMeasurements.tabs,
    layout: ({ renderNode, bounds }) => tabsChildBounds(renderNode, bounds),
    render: (input) => {
      writeRenderBlock(input.buffer, {
        ...input.layoutNode.bounds,
        height: Math.min(1, input.layoutNode.bounds.height)
      }, tabsHeaderBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.focus === 'self',
        input.theme,
        input.widthProfile
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused, children }) => ({
      id,
      role: 'group',
      label: id,
      ...(typeof renderNode.props.selected === 'string' ? { value: renderNode.props.selected } : {}),
      ...(focused ? { focused } : {}),
      children: tabsAccessibleChildren(renderNode, children)
    }),
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => tabsHitTargets(
      renderNode,
      bounds,
      theme,
      widthProfile
    )
  },
  dialog: {
    measure: layoutMeasurements.dialog,
    layout: ({ renderNode, bounds, measureChild }) => dialogChildBounds(renderNode, bounds, borderForDialog(renderNode), measureChild),
    render: (input) => {
      const focused = input.focus !== 'none';
      const border = borderForDialog(input.renderNode, input.theme);
      const childBounds = dialogBounds(input.renderNode, input.layoutNode.bounds);
      drawSurfaceFrame(input.buffer, childBounds, input.renderNode, input.theme, focused, {
        appearance: 'raised',
        border,
        shadow: true
      });
      drawDialogActionSeparator(input.buffer, input.layoutNode, input.theme, border.style);
      input.renderChildren();
    },
    accessibility: ({ renderNode, id }) => ({
      id,
      role: 'dialog',
      label: dialogLabel(renderNode) || id,
      ...(renderNode.props.modal
        ? {
            scope: {
              kind: 'modal' as const,
              trapsFocus: true,
              obscuresBackground: true
            }
          }
        : {})
    }),
    hitTargets: ({ renderNode, bounds }) => dialogOutsideHitTargets(renderNode, bounds)
  }
} satisfies RendererMap<'column' | 'row' | 'viewport' | 'grid' | 'splitPane' | 'tabs' | 'dialog'>;
