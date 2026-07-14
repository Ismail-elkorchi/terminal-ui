import {
  contextMenuAccessibleBase,
  contextMenuAccessibleChildren,
  dropdownMenuAccessibleBase,
  dropdownMenuAccessibleChildren,
  dropdownMenuBlock,
  menuAccessibleBase,
  menuAccessibleChildren,
  menuBarAccessibleBase,
  menuBarAccessibleChildren,
  menuBarBlock,
  menuBlock,
  menuHitTargets
} from '../menu-widgets.ts';
import {
  contextMenuHitTargets,
  contextMenuPopupBounds,
  dropdownMenuHitTargets,
  dropdownMenuPopupBounds,
  menuBarHitTargets,
  menuBarPopupBounds
} from '../anchored-menus.ts';
import {
  commandInputAccessibleChildren,
  commandInputBlock,
  commandInputCursor,
  commandInputPointerOffset,
  commandInputSuggestionHitTargets
} from '../command-input.ts';
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
    render: ({ renderNode, layoutNode, buffer, theme, focused }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, menuBlock(renderNode, scrollbars.contentBounds, theme, focused));
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
    layout: ({ renderNode, bounds, viewport }) => menuBarPopupBounds(renderNode, bounds, viewport),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, menuBarBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.theme,
        input.focused
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...menuBarAccessibleBase(renderNode, id, focused),
      scope: { kind: 'menu' },
      children: menuBarAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, layoutNode }) => menuBarHitTargets(renderNode, layoutNode)
  },
  contextMenu: {
    layout: ({ renderNode, viewport }) => contextMenuPopupBounds(renderNode, viewport),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = contextMenuAccessibleChildren(renderNode);
      return {
        ...contextMenuAccessibleBase(renderNode, id, focused),
        scope: { kind: 'popover', trapsFocus: renderNode.props.presentation.kind === 'open' },
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ renderNode, bounds }) => renderNode.props.presentation.kind === 'open' ? [focusTarget(bounds)] : [],
    hitTargets: ({ renderNode, layoutNode }) => contextMenuHitTargets(renderNode, layoutNode)
  },
  dropdownMenu: {
    layout: ({ renderNode, bounds, viewport }) => dropdownMenuPopupBounds(renderNode, bounds, viewport),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, dropdownMenuBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.theme,
        input.focused
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = dropdownMenuAccessibleChildren(renderNode);
      return {
        ...dropdownMenuAccessibleBase(renderNode, id, focused),
        ...(renderNode.props.presentation.kind === 'open' ? { scope: { kind: 'menu' as const } } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, layoutNode }) => dropdownMenuHitTargets(renderNode, layoutNode)
  },
  commandInput: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, commandInputBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = commandInputAccessibleChildren(renderNode);
      return {
        id,
        role: 'textbox',
        label: stringify(renderNode.props.prompt) || id,
        value: stringify(renderNode.props.value),
        ...(focused ? { focused } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, commandInputCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds }) => [
      ...textPointerHitTargets({
        id: `${renderNode.id ?? renderNode.kind}:text`,
        bounds: { ...bounds, height: Math.min(1, bounds.height) },
        toMessage: textPointerMessageFactory(renderNode),
        offsetAt: (event) => commandInputPointerOffset(renderNode, bounds, event)
      }),
      ...commandInputSuggestionHitTargets(renderNode, bounds)
    ]
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
} satisfies RendererMap<'menu' | 'menuBar' | 'contextMenu' | 'dropdownMenu' | 'commandInput' | 'palette'>;
