import { createFrameBuffer } from '../frame.ts';
import { splitTracks } from '../regions.ts';
import { writeRenderBlock } from './support/block.ts';
import { borderForModal, modalLabel } from './support/border.ts';
import { cellInside, groupAccessibleNode } from './support/common.ts';
import {
  childLayoutSizes,
  gridChildBounds,
  layoutFlowOptions,
  priorityFillLayoutSizes,
  splitPaneChildBounds
} from './support/layout.ts';
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
import { drawModalActionSeparator, modalChildBounds, modalDialogBounds } from './support/modal.ts';
import { drawSurfaceFrame } from '../surface.ts';
import type { RendererMap } from './types.ts';

export const layoutRenderers = {
  row: {
    layout: ({ renderNode, bounds, childMeasures }) => splitTracks(
      bounds,
      'horizontal',
      childLayoutSizes(renderNode, priorityFillLayoutSizes(renderNode.children ?? [])),
      layoutFlowOptions(renderNode),
      childMeasures.map((measure) => measure.preferredWidth)
    ),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  stack: {
    layout: ({ renderNode, bounds, childMeasures }) => splitTracks(
      bounds,
      'vertical',
      childLayoutSizes(renderNode),
      layoutFlowOptions(renderNode),
      childMeasures.map((measure) => measure.preferredHeight)
    ),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  viewport: {
    layout: ({ renderNode, bounds }) => [viewportChildBounds(renderNode, bounds)],
    render: (input) => {
      const viewportBuffer = createFrameBuffer(input.buffer.width, input.buffer.height);
      input.renderChildren(viewportBuffer);
      const scrollbars = scrollbarsForRenderNode(input.renderNode, input.layoutNode.bounds, (contentBounds) => viewportScrollbarState(input.renderNode, contentBounds), 'both');
      const occupiedCells = new Set<string>();
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, scrollbars.contentBounds)) {
          input.buffer.writeCell(cell);
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
    layout: ({ renderNode, bounds, childMeasures }) => gridChildBounds(renderNode, bounds, childMeasures),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  splitPane: {
    layout: ({ renderNode, bounds, childMeasures }) => splitPaneChildBounds(renderNode, bounds, childMeasures),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  tabs: {
    layout: ({ renderNode, bounds }) => tabsChildBounds(renderNode, bounds),
    render: (input) => {
      writeRenderBlock(input.buffer, {
        ...input.layoutNode.bounds,
        height: Math.min(1, input.layoutNode.bounds.height)
      }, tabsHeaderBlock(input.renderNode, input.layoutNode.bounds, input.focused));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => ({
      id,
      role: 'menu',
      label: id,
      ...(focused ? { focused } : {}),
      children: tabsAccessibleChildren(renderNode)
    }),
    hitTargets: ({ renderNode, bounds }) => tabsHitTargets(renderNode, bounds)
  },
  modal: {
    layout: ({ renderNode, bounds, childMeasures }) => modalChildBounds(renderNode, bounds, borderForModal(renderNode), childMeasures),
    render: (input) => {
      const border = borderForModal(input.renderNode, input.focused);
      const childBounds = modalDialogBounds(input.renderNode, input.layoutNode.bounds);
      drawSurfaceFrame(input.buffer, childBounds, input.renderNode, input.theme, input.focused, {
        variant: 'raised',
        border,
        shadow: true
      });
      drawModalActionSeparator(input.buffer, input.layoutNode, input.theme, border.style);
      input.renderChildren();
    },
    accessibility: ({ renderNode, id }) => ({
      id,
      role: 'dialog',
      label: modalLabel(renderNode) || id,
      scope: {
        kind: 'modal',
        trapsFocus: true,
        obscuresBackground: true
      }
    })
  }
} satisfies RendererMap<'row' | 'stack' | 'viewport' | 'grid' | 'splitPane' | 'tabs' | 'modal'>;
