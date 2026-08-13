import type { LayoutSize } from '../../../geometry/types.ts';
import type { SplitPaneAction } from '../../../ui-model/split-pane.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export type ColumnRenderProps = RenderNodeLayoutProps & { readonly sizes?: readonly LayoutSize[] };

export interface FlowRenderProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly gap?: number;
  readonly lineGap?: number;
}

export interface MeasuredColumnRenderEntry {
  readonly rowOffset: number;
  readonly clippedRowsBefore: number;
  readonly rows: number;
}

export interface MeasuredColumnRenderProps {
  readonly entries: readonly MeasuredColumnRenderEntry[];
  readonly viewportRows: number;
}

export interface GridRenderProps extends RenderNodeLayoutProps {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly areas?: readonly (readonly string[])[];
  readonly areaNames?: readonly string[];
  readonly gap?: number;
  readonly rowGap?: number;
  readonly columnGap?: number;
}

export type SplitPaneRenderProps<TMessage = never> = RenderNodeLayoutProps & {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
  readonly activeDivider?: number;
  readonly toActionMessage?: (action: SplitPaneAction) => TMessage;
};
