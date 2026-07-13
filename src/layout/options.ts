import type { ScrollEvent, ScrollPolicy } from '../interaction/scroll.ts';
import type { ItemBase } from '../ui-model/contracts.ts';
import type { TabAction } from '../ui-model/tabs.ts';
import type { Element } from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementOptions,
  InteractiveElementOptions,
  SurfaceVisualState
} from '../element/metadata.ts';
import type { DataListStylePart, ModalStylePart, SurfaceStylePart, TabsStylePart } from '../ui-model/style-parts.ts';
import type { BorderStyle, BorderTitle } from '../visual/border.ts';
import type { ScrollbarOptions } from '../interaction/scrollbar.ts';
import type { SurfaceVariant } from '../visual/surface.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from '../geometry/types.ts';

export interface StackOptions extends ElementOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface RowOptions extends ElementOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface GridOptions extends ElementOptions, GridLayoutOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

export interface GridAreasOptions<TMessage = never> extends ElementOptions, GridLayoutOptions {
  readonly areas: string;
  readonly children: Readonly<Record<string, Element<TMessage>>>;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

export interface SplitPaneOptions extends ElementOptions, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
}

export interface TabItem<TMessage = never> extends ItemBase {
  readonly badge?: string;
  readonly closable?: boolean;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends InteractiveElementOptions<TabsStylePart>, LayoutFlowOptions {
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly onAction?: (action: TabAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ModalOptions<TMessage = never> extends InteractiveElementOptions<ModalStylePart>, LayoutFlowOptions {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ViewportOptions<TMessage = never> extends InteractiveElementOptions<DataListStylePart>, LayoutFlowOptions {
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll?: (event: ScrollEvent) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SurfaceOptions extends ElementOptions<SurfaceStylePart>, Omit<LayoutFlowOptions, 'gap'> {
  readonly label?: string;
  readonly title?: BorderTitle;
  readonly variant?: SurfaceVariant;
  readonly visualState?: SurfaceVisualState;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
}

export interface AbsoluteOptions extends ElementOptions {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export type OverlayOptions = ElementOptions;
