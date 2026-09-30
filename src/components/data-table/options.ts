import type { ControlKeymap } from '../../interaction/control-keymap.ts';
import type { DataGridKeyAction } from '../keymaps.ts';
import type {
  CompleteTableCollection,
  DataGridActivateEvent,
  DataGridControlTransition,
  DataGridTransition,
  ScrollableDataGridState,
  TableState,
  UnscrolledDataGridState,
  WindowedTableCollection,
} from '../../behavior/table.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ComponentDensity } from '../density.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { TableStylePart } from '../style-parts.ts';
import type { TableColumn } from './column.ts';


interface TableCommonOptions {
  readonly id: string;
  readonly density?: ComponentDensity;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
}

type TableDataOptions<TRow> =
  | {
      readonly rows: readonly TRow[];
      readonly getRowId: (row: TRow, index: number) => string;
      readonly collection?: never;
      readonly columns?: readonly TableColumn<TRow>[];
    }
  | {
      readonly collection: CompleteTableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
      readonly columns?: readonly TableColumn<TRow>[];
    }
  | {
      readonly collection: WindowedTableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
      readonly columns: readonly TableColumn<TRow>[];
    };

interface TableOptionsBase extends TableCommonOptions {
  readonly state?: TableState;
  readonly busy?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TableStylePart, 'active' | 'selected'>;
  readonly meta?: ComponentMetadataOptions<readonly ['layer', 'styles']>;
}

export type UnscrolledTableOptions<TRow> = TableOptionsBase & TableDataOptions<TRow> & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
};

export type ScrollableTableOptions<TRow, TMessage extends ComponentMessage = never> =
  TableOptionsBase & TableDataOptions<TRow> & {
  readonly scroll: {
    readonly state: ScrollState;
    readonly onScroll: (request: import('../../interaction/scroll.ts').ScrollRequest) => MessageResolution<TMessage>;
  };
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
};

export type TableOptions<TRow, TMessage extends ComponentMessage = never> =
  | UnscrolledTableOptions<TRow>
  | ScrollableTableOptions<TRow, TMessage>;

interface DataGridCallbacks<
  TTransition,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: DataGridActivateEvent) => MessageResolution<TActivateMessage>;
}

interface DataGridBaseOptions extends TableCommonOptions {
  readonly keymap?: ControlKeymap<DataGridKeyAction>;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TableStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type DataGridAvailability<
  TTransition,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> =
    | (DataGridCallbacks<TTransition, TTransitionMessage, TActivateMessage> & {
        readonly disabled?: boolean;
        readonly inert?: boolean;
      })
    | (RetainedCallbacks<DataGridCallbacks<TTransition, TTransitionMessage, TActivateMessage>> & (
        | {
            readonly disabled: true;
            readonly inert?: boolean;
          }
        | {
            readonly inert: true;
            readonly disabled?: boolean;
          }
      ));

export type UnscrolledDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly state: UnscrolledDataGridState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & DataGridAvailability<DataGridControlTransition, TTransitionMessage, TActivateMessage>;

export type ScrollableDataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = DataGridBaseOptions & TableDataOptions<TRow> & {
  readonly state: ScrollableDataGridState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & DataGridAvailability<DataGridTransition, TTransitionMessage, TActivateMessage>;

export type DataGridOptions<
  TRow,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledDataGridOptions<TRow, TTransitionMessage, TActivateMessage>
  | ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage>;
