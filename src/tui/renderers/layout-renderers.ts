import { createFrameBuffer } from '../frame.ts';
import { splitTracks } from '../regions.ts';
import { writeRenderBlock } from './support/block.ts';
import { borderContentBounds, borderForModal, modalLabel } from './support/border.ts';
import { cellInside, groupAccessibleNode } from './support/common.ts';
import {
  fillLayoutSizes,
  gridChildBounds,
  layoutFlowOptions,
  priorityFillLayoutSizes,
  splitPaneChildBounds
} from './support/layout.ts';
import { tabsAccessibleChildren, tabsChildBounds, tabsHeaderBlock, tabsHitTargets } from './support/tabs.ts';
import {
  drawScrollbars,
  scrollbarsForWidget,
  viewportScrollbarState
} from './support/scroll.ts';
import { modalChildBounds, viewportAccessibleDescription, viewportChildBounds } from './support/viewport.ts';
import { drawSurfaceFrame } from '../surface.ts';
import type { RendererMap } from './types.ts';

export const layoutRenderers = {
  row: {
    layout: ({ widget, bounds }) => splitTracks(bounds, 'horizontal', priorityFillLayoutSizes(widget.children ?? []), layoutFlowOptions(widget)),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  stack: {
    layout: ({ widget, bounds, childMeasures }) => splitTracks(
      bounds,
      'vertical',
      fillLayoutSizes(widget.children?.length ?? 0),
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
      const scrollbars = scrollbarsForWidget(input.widget, input.node.bounds, viewportScrollbarState(input.widget, input.node.bounds), 'both');
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, scrollbars.contentBounds)) input.buffer.writeCell(cell);
      }
      drawScrollbars(input.buffer, scrollbars, input.theme);
    },
    accessibility: ({ widget, node, id }) => ({
      id,
      role: 'text',
      label: id,
      description: viewportAccessibleDescription(widget, node)
    })
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
      }, tabsHeaderBlock(input.widget, input.node.bounds));
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
    layout: ({ widget, bounds }) => [borderContentBounds(modalChildBounds(widget, bounds), borderForModal(widget))],
    render: (input) => {
      const childBounds = modalChildBounds(input.widget, input.node.bounds);
      drawSurfaceFrame(input.buffer, childBounds, input.widget, input.theme, input.focused, {
        variant: 'raised',
        border: borderForModal(input.widget),
        shadow: true
      });
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
