import type { BorderStyle } from '../../tui/border.ts';
import type { LayoutSize } from '../../layout/geometry.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export type StackRenderProps = RenderNodeLayoutProps & { readonly sizes?: readonly LayoutSize[] };
export type RowRenderProps = StackRenderProps;

export interface GridRenderProps extends RenderNodeLayoutProps {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly areas?: readonly (readonly string[])[];
  readonly areaNames?: readonly string[];
  readonly gap?: number;
  readonly rowGap?: number;
  readonly columnGap?: number;
}

export type SplitPaneRenderProps = RenderNodeLayoutProps & {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
};

export interface RenderTabItem<TMessage> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly message?: TMessage;
  readonly badge?: string;
  readonly closeMessage?: TMessage;
}

export type TabsRenderProps<TMessage> = RenderNodeLayoutProps & {
  readonly tabs: readonly RenderTabItem<TMessage>[];
  readonly selected?: string;
};

export type ModalRenderProps = RenderNodeLayoutProps & {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
};
