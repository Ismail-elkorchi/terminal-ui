import type { BorderStyle } from '../../tui/border.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../behavior/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { ActionItem, ComponentTone, HierarchyItem } from '../contracts.ts';
import type { ComponentKeyBindings, ComponentOptions, InteractiveComponentOptions } from './base.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../style-parts.ts';

export interface MenuItem<TMessage = never> extends ActionItem<TMessage>, HierarchyItem<MenuItem<TMessage>> {
  readonly checked?: boolean;
}

export interface MenuOptions<TMessage = never> extends InteractiveComponentOptions<MenuStylePart> {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends InteractiveComponentOptions<MenuStylePart> {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends InteractiveComponentOptions<MenuStylePart> {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface DropdownOptions<TMessage = never> extends InteractiveComponentOptions<MenuStylePart> {
  readonly label?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly open?: boolean;
  readonly placeholder?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';

export interface DividerOptions extends ComponentOptions<DividerStylePart> {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export interface TooltipOptions extends ComponentOptions<TooltipStylePart> {
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
}
