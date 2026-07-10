import type { BorderStyle } from '../../tui/border.ts';
import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../tui/scroll.ts';
import type { ScrollbarOptions } from '../../tui/scrollbar.ts';
import type { ActionItem, ComponentTone, HierarchyItem } from '../contracts.ts';
import type { ComponentKeyBindings, ComponentOptions } from './base.ts';

export interface MenuItem<TMessage = never> extends ActionItem<TMessage>, HierarchyItem<MenuItem<TMessage>> {
  readonly checked?: boolean;
}

export interface MenuOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends ComponentOptions {
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

export interface DropdownOptions<TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly items: readonly MenuItem<TMessage>[];
  readonly selected?: string;
  readonly open?: boolean;
  readonly placeholder?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';

export interface DividerOptions<TMessage = never> extends ComponentOptions {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export interface TooltipOptions<TMessage = never> extends ComponentOptions {
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
  readonly keys?: ComponentKeyBindings<TMessage>;
}
