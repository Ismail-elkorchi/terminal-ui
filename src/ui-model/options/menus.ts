import type { BorderStyle } from '../../tui/border.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { ComponentActionTone, ComponentTone, HierarchyItem, ItemBase } from '../contracts.ts';
import type { DropdownAction, DropdownPresentation, MenuAction } from '../menu.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../style-parts.ts';

export interface MenuItem extends ItemBase, HierarchyItem<MenuItem> {
  readonly checked?: boolean;
  readonly shortcut?: string;
  readonly tone?: ComponentActionTone;
}

export interface MenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface DropdownOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart> {
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly presentation: DropdownPresentation;
  readonly placeholder?: string;
  readonly onAction?: (action: DropdownAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';

export interface DividerOptions extends ElementOptions<DividerStylePart> {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export interface TooltipOptions extends ElementOptions<TooltipStylePart> {
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
}
