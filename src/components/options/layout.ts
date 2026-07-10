import type { BorderStyle } from '../../tui/border.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from '../../tui/regions.ts';
import type { NavigationItem } from '../contracts.ts';
import type { Element } from '../element.ts';
import type { ComponentKeyBindings, ComponentOptions } from './base.ts';

export interface GridOptions<TMessage = never> extends ComponentOptions, GridLayoutOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface GridAreasOptions<TMessage = never> extends ComponentOptions, GridLayoutOptions {
  readonly areas: string;
  readonly children: Readonly<Record<string, Element<TMessage>>>;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SplitPaneOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TabItem<TMessage = never> extends NavigationItem<TMessage> {
  readonly badge?: string;
  readonly onClose?: TMessage;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ModalOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly keys?: ComponentKeyBindings<TMessage>;
}
