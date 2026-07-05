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
  scrollbarHitTargetsForWidget,
  scrollbarsForWidget,
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
    layout: ({ widget, bounds, childMeasures }) => splitTracks(
      bounds,
      'horizontal',
      childLayoutSizes(widget, priorityFillLayoutSizes(widget.children ?? [])),
      layoutFlowOptions(widget),
      childMeasures.map((measure) => measure.preferredWidth)
    ),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  stack: {
    layout: ({ widget, bounds, childMeasures }) => splitTracks(
      bounds,
      'vertical',
      childLayoutSizes(widget),
      layoutFlowOptions(widget),
      childMeasures.map((measure) => measure.preferredHeight)
    ),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  viewport: {
    layout: ({ widget, bounds }) => [viewportChildBounds(widget, bounds)],
    render: (input) => {
      const viewportBuffer = createFrameBuffer(input.buffer.width, input.buffer.height);
      input.renderChildren(viewportBuffer);
      const scrollbars = scrollbarsForWidget(input.widget, input.node.bounds, (contentBounds) => viewportScrollbarState(input.widget, contentBounds), 'both');
      const occupiedCells = new Set<string>();
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, scrollbars.contentBounds)) {
          input.buffer.writeCell(cell);
          occupiedCells.add(viewportIndicatorCellKey(cell.row, cell.column));
        }
      }
      drawViewportIndicators(input.buffer, input.widget, scrollbars.contentBounds, input.theme, occupiedCells);
      drawScrollbars(input.buffer, input.widget, scrollbars, input.theme);
    },
    accessibility: ({ widget, node, id }) => ({
      id,
      role: 'text',
      label: id,
      description: viewportAccessibleDescription(widget, node)
    }),
    hitTargets: ({ widget, bounds }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => viewportScrollbarState(widget, contentBounds), 'both');
      return scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state);
    }
  },
  grid: {
    layout: ({ widget, bounds, childMeasures }) => gridChildBounds(widget, bounds, childMeasures),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  splitPane: {
    layout: ({ widget, bounds, childMeasures }) => splitPaneChildBounds(widget, bounds, childMeasures),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  tabs: {
    layout: ({ widget, bounds }) => tabsChildBounds(widget, bounds),
    render: (input) => {
      writeRenderBlock(input.buffer, {
        ...input.node.bounds,
        height: Math.min(1, input.node.bounds.height)
      }, tabsHeaderBlock(input.widget, input.node.bounds, input.focused));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => ({
      id,
      role: 'menu',
      label: id,
      ...(focused ? { focused } : {}),
      children: tabsAccessibleChildren(widget)
    }),
    hitTargets: ({ widget, bounds }) => tabsHitTargets(widget, bounds)
  },
  modal: {
    layout: ({ widget, bounds, childMeasures }) => modalChildBounds(widget, bounds, borderForModal(widget), childMeasures),
    render: (input) => {
      const border = borderForModal(input.widget, input.focused);
      const childBounds = modalDialogBounds(input.widget, input.node.bounds);
      drawSurfaceFrame(input.buffer, childBounds, input.widget, input.theme, input.focused, {
        variant: 'raised',
        border,
        shadow: true
      });
      drawModalActionSeparator(input.buffer, input.node, input.theme, border.style);
      input.renderChildren();
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'dialog',
      label: modalLabel(widget) || id,
      scope: {
        kind: 'modal',
        trapsFocus: true,
        obscuresBackground: true
      }
    })
  }
} satisfies RendererMap<'row' | 'stack' | 'viewport' | 'grid' | 'splitPane' | 'tabs' | 'modal'>;
