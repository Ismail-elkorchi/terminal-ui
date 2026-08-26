import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type {
  CollectionSnapshot,
  CollectionItem,
  CompleteCollectionSnapshot,
  WindowedCollectionSnapshot,
} from '../collection/snapshot.ts';

export interface TableCollectionRow<TRow> extends CollectionItem {
  readonly row: TRow;
}

export type TableCollection<TRow> = CollectionSnapshot<TableCollectionRow<TRow>>;
export type CompleteTableCollection<TRow> = CompleteCollectionSnapshot<TableCollectionRow<TRow>>;
export type WindowedTableCollection<TRow> = WindowedCollectionSnapshot<TableCollectionRow<TRow>>;

export type TableSortDirection = 'ascending' | 'descending';

export interface TableSortState {
  readonly columnId: string;
  readonly direction: TableSortDirection;
}

export interface TableState {
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
}

export interface DataGridCell {
  readonly rowId: string;
  readonly columnId: string;
}

export type DataGridRowSelection =
  | { readonly mode: 'none' }
  | { readonly mode: 'single'; readonly selectedRowId?: string; readonly selectionFollowsActive?: boolean }
  | {
      readonly mode: 'multiple';
      readonly selectedRowIds: readonly string[];
      readonly selectionAnchorId?: string;
      readonly rangeSelectionEnabled?: boolean;
    };

export type DataGridCellSelection =
  | { readonly mode: 'none' }
  | { readonly mode: 'single'; readonly selectedCell?: DataGridCell; readonly selectionFollowsActive?: boolean }
  | {
      readonly mode: 'multiple';
      readonly selectedCells: readonly DataGridCell[];
      readonly selectionAnchor?: DataGridCell;
      readonly rangeSelectionEnabled?: boolean;
    };

export type DataGridInteraction =
  | {
      readonly kind: 'row';
      readonly activeRowId?: string;
      readonly selection: DataGridRowSelection;
    }
  | {
      readonly kind: 'cell';
      readonly activeCell?: DataGridCell;
      readonly selection: DataGridCellSelection;
    };

interface DataGridStateBase extends TableState {
  readonly interaction: DataGridInteraction;
}

export interface UnscrolledDataGridState extends DataGridStateBase {
  readonly scroll?: never;
}

export interface ScrollableDataGridState extends DataGridStateBase {
  readonly scroll: ScrollState;
}

export type DataGridState =
  | UnscrolledDataGridState
  | ScrollableDataGridState;

export type DataGridTransition =
  | { readonly kind: 'setActiveRow'; readonly rowId: string }
  | { readonly kind: 'setActiveCell'; readonly cell: DataGridCell }
  | { readonly kind: 'moveRow'; readonly delta: number }
  | { readonly kind: 'moveColumn'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstRow' }
  | { readonly kind: 'lastRow' }
  | {
      readonly kind: 'commit';
      readonly extendSelection?: boolean;
      readonly toggleSelection?: boolean;
    }
  | { readonly kind: 'sortBy'; readonly columnId: string }
  | { readonly kind: 'resizeColumnBy'; readonly columnId: string; readonly delta: number }
  | { readonly kind: 'setColumnWidth'; readonly columnId: string; readonly width: number }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type DataGridControlTransition = Exclude<DataGridTransition, { readonly kind: 'scroll' }>;

export interface DataGridActivateEvent {
  readonly kind: 'activate';
  readonly target:
    | { readonly kind: 'row'; readonly rowId: string }
    | { readonly kind: 'cell'; readonly cell: DataGridCell };
}
