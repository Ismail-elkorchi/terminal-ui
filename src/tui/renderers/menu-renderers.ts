import {
  contextMenuTitleBlock,
  contextMenuTitleRows,
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
  commandBarCursor,
  commandBarPointerOffset
} from '../command-bar.ts';
import { paletteAccessibleChildren, paletteBlock, paletteHitTargets } from '../palette.ts';
import { textPointerHitTargets, textPointerMessageFactory } from '../text-pointer.ts';
import { stringify } from '../render-node-props.ts';
import {
  drawScrollbars,
  menuScrollbarState,
  paletteScrollbarState,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode
} from './support/scroll.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import type { RendererMap } from './types.ts';

export const menuRenderers = {
  menu: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, menuBlock(renderNode, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...menuAccessibleBase(renderNode, id, focused),
      scope: { kind: 'menu' },
      children: menuAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...menuHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  menuBar: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, menuBarBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...menuAccessibleBase(renderNode, id, focused),
      scope: { kind: 'menu' },
      children: menuAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => menuBarHitTargets(renderNode, bounds)
  },
  contextMenu: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const titleRows = contextMenuTitleRows(renderNode);
      const bodyBounds = contextMenuBodyBounds(layoutNode.bounds, titleRows);
      const scrollbars = scrollbarsForRenderNode(renderNode, bodyBounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, layoutNode.bounds, contextMenuTitleBlock(renderNode, layoutNode.bounds));
      writeRenderBlock(buffer, scrollbars.contentBounds, menuBlock(renderNode, scrollbars.contentBounds, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...menuAccessibleBase(renderNode, id, focused),
      scope: { kind: 'popover' },
      children: menuAccessibleChildren(renderNode)
    }),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, menuCursor(renderNode, bounds, renderNode.props.title === undefined ? 0 : 1))],
    hitTargets: ({ renderNode, bounds }) => {
      const bodyBounds = contextMenuBodyBounds(bounds, contextMenuTitleRows(renderNode));
      const scrollbars = scrollbarsForRenderNode(renderNode, bodyBounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...menuHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  dropdown: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, dropdownBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = dropdownAccessibleChildren(renderNode);
      return {
        ...dropdownAccessibleBase(renderNode, id, focused),
        ...(renderNode.props.presentation.kind === 'open' ? { scope: { kind: 'menu' as const } } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, menuCursor(renderNode, bounds, renderNode.props.presentation.kind === 'open' ? 1 : 0))],
    hitTargets: ({ renderNode, bounds }) => dropdownHitTargets(renderNode, bounds)
  },
  commandBar: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, commandBarBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = commandBarAccessibleChildren(renderNode);
      return {
        id,
        role: 'textbox',
        label: stringify(renderNode.props.prompt) || id,
        value: stringify(renderNode.props.value),
        ...(focused ? { focused } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, commandBarCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds }) => textPointerHitTargets({
      id: `${renderNode.id ?? renderNode.kind}:text`,
      bounds,
      toMessage: textPointerMessageFactory(renderNode),
      offsetAt: (event) => commandBarPointerOffset(renderNode, bounds, event)
    })
  },
  palette: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => paletteScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, paletteBlock(renderNode, scrollbars.contentBounds.height, theme));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      id,
      role: 'menu',
      label: stringify(renderNode.props.title) || id,
      value: stringify(renderNode.props.query),
      ...(focused ? { focused } : {}),
      scope: { kind: 'menu' },
      children: paletteAccessibleChildren(renderNode, layoutNode.bounds.height)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => paletteScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...paletteHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  }
} satisfies RendererMap<'menu' | 'menuBar' | 'contextMenu' | 'dropdown' | 'commandBar' | 'palette'>;

function contextMenuBodyBounds(
  bounds: { readonly row: number; readonly column: number; readonly width: number; readonly height: number },
  titleRows: number
): typeof bounds {
  const rows = Math.min(Math.max(0, titleRows), Math.max(0, bounds.height));
  return {
    row: bounds.row + rows,
    column: bounds.column,
    width: bounds.width,
    height: Math.max(0, bounds.height - rows)
  };
}
