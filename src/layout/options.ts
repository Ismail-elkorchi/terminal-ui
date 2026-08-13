import type { ScrollEvent, ScrollPolicy } from '../interaction/scroll.ts';
import type { ElementValue } from '../element/index.ts';
import type {
  ElementKeyBindings,
  ElementOptions,
  InteractiveElementOptions
} from '../element/metadata.ts';
import type { DataListStylePart, SurfaceStylePart } from '../ui-model/style-parts.ts';
import type { BorderOptions, BorderTitle } from '../visual/border.ts';
import type { ScrollbarOptions } from '../interaction/scrollbar.ts';
import type { SurfaceAppearance } from '../visual/surface.ts';
import type { GridLayoutOptions, LayoutFlowOptions, LayoutSize } from '../geometry/types.ts';
import type { SplitPaneStylePart } from '../ui-model/style-parts.ts';
import type { SplitPaneAction } from '../ui-model/split-pane.ts';
import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfaceFit,
  AnchoredSurfacePlacement,
  AnchoredSurfaceSide
} from '../interaction/anchored-surface.ts';

export interface ColumnOptions extends ElementOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface RowOptions extends ElementOptions, LayoutFlowOptions {
  readonly sizes?: readonly LayoutSize[];
}

export interface FlowOptions extends ElementOptions {
  readonly direction: 'horizontal' | 'vertical';
  readonly gap?: number;
  readonly lineGap?: number;
}

export interface GridOptions extends ElementOptions, GridLayoutOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

export interface GridAreasOptions<
  TChildren extends Readonly<Record<string, ElementValue>> = Readonly<Record<string, ElementValue>>
> extends ElementOptions, GridLayoutOptions {
  readonly areas: string;
  readonly children: TChildren;
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
}

interface SplitPaneOptionsBase extends ElementOptions<SplitPaneStylePart>, LayoutFlowOptions {
  readonly direction: 'horizontal' | 'vertical';
}

export interface PassiveSplitPaneOptions extends SplitPaneOptionsBase {
  readonly sizes?: readonly LayoutSize[];
  readonly activeDivider?: never;
  readonly resizeStep?: never;
  readonly onAction?: never;
  readonly keys?: never;
}

export interface ResizableSplitPaneOptions<TMessage> extends SplitPaneOptionsBase {
  readonly id: string;
  readonly sizes: readonly { readonly kind: 'percent'; readonly value: number }[];
  readonly activeDivider?: number;
  readonly resizeStep?: number;
  readonly onAction: (action: SplitPaneAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type SplitPaneOptions<TMessage = never> = PassiveSplitPaneOptions | ResizableSplitPaneOptions<TMessage>;

export interface ViewportOffset {
  readonly row?: number;
  readonly column?: number;
}

export type ViewportOptions<TMessage = never> =
  | PassiveViewportOptions
  | ScrollableViewportOptions<TMessage>;

export interface PassiveViewportOptions
  extends ElementOptions<DataListStylePart>, LayoutFlowOptions {
  readonly offset?: ViewportOffset;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
  readonly onScroll?: never;
  readonly keys?: never;
  readonly pointer?: never;
}

export interface ScrollableViewportOptions<TMessage = never>
  extends InteractiveElementOptions<DataListStylePart, TMessage>, LayoutFlowOptions {
  readonly offset?: ViewportOffset;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onScroll: (event: ScrollEvent) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SurfaceOptions extends ElementOptions<SurfaceStylePart>, Omit<LayoutFlowOptions, 'gap'> {
  readonly title?: BorderTitle;
  readonly appearance?: SurfaceAppearance;
  readonly border?: BorderOptions;
  readonly shadow?: boolean;
}

export interface AbsoluteOptions extends ElementOptions {
  readonly row: number;
  readonly column: number;
  readonly width?: number;
  readonly height?: number;
}

export interface AnchoredOptions extends ElementOptions {
  readonly anchor: AnchoredSurfaceAnchor;
  readonly placement?: AnchoredSurfacePlacement;
  readonly fallback?: readonly AnchoredSurfaceSide[];
  readonly margin?: number;
  readonly fit?: AnchoredSurfaceFit;
}

export interface PortalOptions<TMessage = never> extends ElementOptions {
  readonly anchor: AnchoredSurfaceAnchor | { readonly kind: 'allocation' };
  readonly placement?: AnchoredSurfacePlacement | 'center';
  readonly fallback?: readonly AnchoredSurfaceSide[];
  readonly margin?: number;
  readonly fit?: AnchoredSurfaceFit;
  readonly onOutsidePress?: () => TMessage;
}
