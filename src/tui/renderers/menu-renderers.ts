import {
  contextMenuBlock,
  contextMenuHitTargets,
  dropdownAccessibleBase,
  dropdownAccessibleChildren,
  dropdownBlock,
  dropdownHitTargets,
  menuAccessibleBase,
  menuAccessibleChildren,
  menuBarBlock,
  menuBarHitTargets,
  menuBlock,
  menuCursor,
  menuHitTargets
} from '../menu-widgets.ts';
import {
  commandBarAccessibleChildren,
  commandBarBlock,
  commandBarCursor
} from '../command-bar.ts';
import { paletteAccessibleChildren, paletteBlock } from '../palette.ts';
import { stringify } from '../widget-props.ts';
import {
  drawScrollbars,
  menuScrollbarState,
  paletteScrollbarState,
  scrollbarsForWidget
} from './support/scroll.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import type { RendererMap } from './types.ts';

export const menuRenderers = {
  menu: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, menuScrollbarState(widget, node.bounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, menuBlock(widget, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => menuHitTargets(widget, bounds)
  },
  menuBar: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, menuBarBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => menuBarHitTargets(widget, bounds)
  },
  contextMenu: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, contextMenuBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, menuCursor(widget, bounds, widget.props['title'] === undefined ? 0 : 1))],
    hitTargets: ({ widget, bounds }) => contextMenuHitTargets(widget, bounds)
  },
  dropdown: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, dropdownBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => {
      const children = dropdownAccessibleChildren(widget);
      return {
        ...dropdownAccessibleBase(widget, id, focused),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, menuCursor(widget, bounds, widget.props['open'] === true ? 1 : 0))],
    hitTargets: ({ widget, bounds }) => dropdownHitTargets(widget, bounds)
  },
  commandBar: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, commandBarBlock(widget, node.bounds.height, theme));
    },
    accessibility: ({ widget, id, focused }) => {
      const children = commandBarAccessibleChildren(widget);
      return {
        id,
        role: 'textbox',
        label: stringify(widget.props['prompt']) || id,
        value: stringify(widget.props['value']),
        ...(focused ? { focused } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, commandBarCursor(widget, bounds))]
  },
  palette: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, paletteScrollbarState(widget, node.bounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, paletteBlock(widget, scrollbars.contentBounds.height, theme));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused }) => ({
      id,
      role: 'menu',
      label: stringify(widget.props['title']) || id,
      value: stringify(widget.props['query']),
      ...(focused ? { focused } : {}),
      children: paletteAccessibleChildren(widget, node.bounds.height)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)]
  }
} satisfies RendererMap<'menu' | 'menuBar' | 'contextMenu' | 'dropdown' | 'commandBar' | 'palette'>;
