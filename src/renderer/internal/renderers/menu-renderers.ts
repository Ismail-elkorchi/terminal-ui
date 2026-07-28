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
} from '../menu-rendering.ts';
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
  commandInputPopupBounds,
  commandInputPopupHitTargets,
  commandInputSuggestionHitTargets
} from '../command-input.ts';
import { searchPickerAccessibleChildren, searchPickerBlock, searchPickerHitTargets } from '../search-picker.ts';
import { textPointerHitTargets } from '../text-pointer.ts';
import { stringify } from '../render-node-props.ts';
import {
  drawScrollbars,
  menuScrollbarState,
  searchPickerScrollbarState,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode
} from './support/scroll.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import { menuMeasurements } from './menu-measurements.ts';
import type { RendererMap } from './types.ts';

export const menuRenderers = {
  menu: {
    measure: menuMeasurements.menu,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => menuScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, menuBlock(renderNode, scrollbars.contentBounds, theme, widthProfile, focus === 'self'));
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
    measure: menuMeasurements.menuBar,
    layout: ({ renderNode, bounds, viewport, widthProfile }) => menuBarPopupBounds(renderNode, bounds, viewport, widthProfile),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, menuBarBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.theme,
        input.widthProfile,
        input.focus === 'self'
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...menuBarAccessibleBase(renderNode, id, focused),
      scope: { kind: 'menu' },
      children: menuBarAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, layoutNode, widthProfile }) => menuBarHitTargets(renderNode, layoutNode, widthProfile)
  },
  contextMenu: {
    measure: menuMeasurements.contextMenu,
    layout: ({ renderNode, viewport, widthProfile }) => contextMenuPopupBounds(renderNode, viewport, widthProfile),
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
    measure: menuMeasurements.dropdownMenu,
    layout: ({ renderNode, bounds, viewport, widthProfile }) => dropdownMenuPopupBounds(renderNode, bounds, viewport, widthProfile),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, dropdownMenuBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.theme,
        input.widthProfile,
        input.focus === 'self'
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
    measure: menuMeasurements.commandInput,
    layout: ({ renderNode, bounds, viewport, widthProfile }) =>
      commandInputPopupBounds(renderNode, bounds, viewport, widthProfile),
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile, focus, renderChildren }) => {
      writeRenderBlock(
        buffer,
        layoutNode.bounds,
        commandInputBlock(renderNode, layoutNode.bounds, theme, widthProfile, focus === 'self')
      );
      renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => {
      const children = commandInputAccessibleChildren(renderNode);
      return {
        id,
        role: 'combobox',
        label: stringify(renderNode.props.prompt) || id,
        value: stringify(renderNode.props.value),
        ...(children?.some((child) => child.role === 'listbox')
          ? {
              expanded: true,
              controls: `${renderNode.id ?? 'command-input'}:suggestions`
            }
          : {}),
        ...(focused ? { focused } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ renderNode, bounds, widthProfile }) => [
      focusTarget(bounds, commandInputCursor(renderNode, bounds, widthProfile))
    ],
    hitTargets: ({ renderNode, bounds, layoutNode, widthProfile }) => [
      ...commandInputPopupHitTargets(renderNode, layoutNode),
      ...textPointerHitTargets({
        id: `${renderNode.id ?? renderNode.kind}:text`,
        bounds: { ...bounds, height: Math.min(1, bounds.height) },
        focusTargetId: 'self',
        toMessage: renderNode.props.toActionMessage === undefined
          ? undefined
          : (action) => renderNode.props.toActionMessage?.({ kind: 'pointer', action }),
        offsetAt: (event) => commandInputPointerOffset(renderNode, bounds, event, widthProfile)
      }).map((target) => renderNode.props.display === 'popup'
        ? { ...target, zIndex: 21 }
        : target),
      ...commandInputSuggestionHitTargets(renderNode, bounds)
    ]
  },
  searchPicker: {
    measure: menuMeasurements.searchPicker,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => searchPickerScrollbarState(renderNode, contentBounds), 'vertical');
      writeRenderBlock(buffer, scrollbars.contentBounds, searchPickerBlock(
        renderNode,
        scrollbars.contentBounds.height,
        theme,
        scrollbars.contentBounds.width,
        widthProfile
      ));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused }) => ({
      id,
      role: 'listbox',
      label: stringify(renderNode.props.title) || id,
      value: stringify(renderNode.props.query),
      ...(focused ? { focused } : {}),
      children: searchPickerAccessibleChildren(renderNode, layoutNode.bounds.height)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => searchPickerScrollbarState(renderNode, contentBounds), 'vertical');
      return [
        ...searchPickerHitTargets(renderNode, scrollbars.contentBounds),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  }
} satisfies RendererMap<'menu' | 'menuBar' | 'contextMenu' | 'dropdownMenu' | 'commandInput' | 'searchPicker'>;
