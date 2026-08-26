import type {
  ViewportRenderProps
} from './viewport.ts';
import type {
  GridRenderProps,
  ColumnRenderProps,
  FlowRenderProps,
  MeasuredColumnRenderProps,
  SplitPaneRenderProps
} from './layout.ts';
import type {
  AbsoluteRenderProps,
  AnchoredRenderProps,
  PortalRenderProps,
  SurfaceRenderProps
} from './surfaces.ts';

export interface RenderNodePropsByKind<TMessage> {
  readonly column: ColumnRenderProps;
  readonly row: ColumnRenderProps;
  readonly flow: FlowRenderProps;
  readonly measuredColumn: MeasuredColumnRenderProps;
  readonly surface: SurfaceRenderProps;
  readonly absolute: AbsoluteRenderProps;
  readonly anchored: AnchoredRenderProps;
  readonly portal: PortalRenderProps<TMessage>;
  readonly overlay: Record<never, never>;
  readonly viewport: ViewportRenderProps<TMessage>;
  readonly grid: GridRenderProps;
  readonly splitPane: SplitPaneRenderProps<TMessage>;
  readonly component: ComponentRenderProps;
}

export interface ComponentRenderProps {
  readonly model: unknown;
  readonly accessibleRole?: import('../../../../accessibility/types.ts').AccessibleRole;
  readonly accessibleName?: string;
  readonly slots: readonly {
    readonly name: string;
    readonly start: number;
    readonly count: number;
    readonly accessiblePaths: readonly (readonly number[])[];
  }[];
  readonly toActionMessage?: (action: unknown) => unknown;
}

export type * from './viewport.ts';
export type * from './layout.ts';
export type * from './surfaces.ts';
