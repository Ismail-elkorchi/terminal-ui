import type { SplitPaneTransition } from '../../../../behavior/split-pane.ts';
import type { LayoutFlowOptions, LayoutSize } from '../../../../geometry/types.ts';

export type ColumnRenderProps = LayoutFlowOptions & { readonly sizes?: readonly LayoutSize[] };

export interface FlowRenderProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly gap?: number;
  readonly lineGap?: number;
}

export interface MeasuredColumnRenderEntry {
  readonly rowOffset: number;
  readonly clippedRowsBefore: number;
  readonly rows: number;
  readonly measurementHeight?: number;
  readonly sourceIndex?: number;
}

export interface MeasuredColumnRenderProps {
  readonly entries: readonly MeasuredColumnRenderEntry[];
  readonly totalRows: number;
}

export interface GridRenderProps extends LayoutFlowOptions {
  readonly rows: readonly LayoutSize[];
  readonly columns: readonly LayoutSize[];
  readonly areas?: readonly (readonly string[])[];
  readonly areaNames?: readonly string[];
  readonly gap?: number;
  readonly rowGap?: number;
  readonly columnGap?: number;
}

export type SplitPaneRenderProps<TMessage = never> = LayoutFlowOptions & {
  readonly direction: 'horizontal' | 'vertical';
  readonly sizes?: readonly LayoutSize[];
  readonly activeDivider?: number;
  readonly toActionMessage?: (transition: SplitPaneTransition) => TMessage;
};
