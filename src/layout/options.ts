import type { ScrollEvent, ScrollPolicy } from '../interaction/scroll.ts';
import type { Element } from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementOptions,
  InteractiveElementOptions,
  SurfaceVisualState
} from '../element/metadata.ts';
import type { DataListStylePart, SurfaceStylePart } from '../ui-model/style-parts.ts';
import type { BorderStyle, BorderTitle } from '../visual/border.ts';
import type { ScrollbarOptions } from '../interaction/scrollbar.ts';
import type { SurfaceVariant } from '../visual/surface.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from '../geometry/types.ts';
import type { SplitPaneStylePart } from '../ui-model/style-parts.ts';
import type { SplitPaneAction } from '../ui-model/split-pane.ts';

export interface ColumnOptions extends ElementOptions, LayoutFlowOptions {
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

interface SplitPaneOptionsBase extends ElementOptions<SplitPaneStylePart>, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
}

export interface PassiveSplitPaneOptions extends SplitPaneOptionsBase {
  readonly sizes?: readonly LayoutSize[];
  readonly selectedDivider?: never;
  readonly resizeStep?: never;
  readonly onAction?: never;
  readonly keys?: never;
}

export interface ResizableSplitPaneOptions<TMessage> extends SplitPaneOptionsBase {
  readonly id: string;
  readonly sizes: readonly { readonly kind: 'percent'; readonly value: number }[];
  readonly selectedDivider?: number;
  readonly resizeStep?: number;
  readonly onAction: (action: SplitPaneAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type SplitPaneOptions<TMessage = never> = PassiveSplitPaneOptions | ResizableSplitPaneOptions<TMessage>;

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
