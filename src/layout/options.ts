import type { ScrollEvent, ScrollPolicy } from '../behavior/scroll.ts';
import type { ItemBase } from '../components/contracts.ts';
import type { TabAction } from '../components/tabs.ts';
import type { Element } from '../components/element.ts';
import type {
  ComponentKeyBindings,
  ComponentOptions,
  InteractiveComponentOptions,
  SurfaceVisualState
} from '../components/options/base.ts';
import type { DataListStylePart, ModalStylePart, SurfaceStylePart, TabsStylePart } from '../components/style-parts.ts';
import type { BorderStyle, BorderTitle } from '../tui/border.ts';
import type { ScrollbarOptions } from '../tui/scrollbar.ts';
import type { SurfaceVariant } from '../tui/surface.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from './geometry.ts';

export interface StackOptions extends ComponentOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface RowOptions extends ComponentOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface GridOptions extends ComponentOptions, GridLayoutOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

export interface GridAreasOptions<TMessage = never> extends ComponentOptions, GridLayoutOptions {
  readonly areas: string;
  readonly children: Readonly<Record<string, Element<TMessage>>>;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

export interface SplitPaneOptions extends ComponentOptions, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
}

export interface TabItem<TMessage = never> extends ItemBase {
  readonly badge?: string;
  readonly closable?: boolean;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends InteractiveComponentOptions<TabsStylePart>, LayoutFlowOptions {
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly onAction?: (action: TabAction) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ModalOptions<TMessage = never> extends InteractiveComponentOptions<ModalStylePart>, LayoutFlowOptions {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ViewportOptions<TMessage = never> extends InteractiveComponentOptions<DataListStylePart>, LayoutFlowOptions {
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SurfaceOptions extends ComponentOptions<SurfaceStylePart>, Omit<LayoutFlowOptions, 'gap'> {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly variant?: SurfaceVariant;
  readonly visualState?: SurfaceVisualState;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
}

export interface AbsoluteOptions extends ComponentOptions {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export type OverlayOptions = ComponentOptions;
