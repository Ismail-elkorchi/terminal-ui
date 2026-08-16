import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type {
  CollectionProjection,
  CollectionRecord,
  CompleteCollectionProjection,
  WindowedCollectionProjection,
} from './collection.ts';

export interface TableCollectionRecord<TRow> extends CollectionRecord {
  readonly row: TRow;
}

export type TableCollection<TRow> = CollectionProjection<TableCollectionRecord<TRow>>;
export type CompleteTableCollection<TRow> = CompleteCollectionProjection<TableCollectionRecord<TRow>>;
export type WindowedTableCollection<TRow> = WindowedCollectionProjection<TableCollectionRecord<TRow>>;

export type TableSortDirection = 'ascending' | 'descending';

export interface TableSortState {
  readonly columnId: string;
  readonly direction: TableSortDirection;
}

export interface TablePresentation {
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

interface DataGridPresentationBase extends TablePresentation {
  readonly interaction: DataGridInteraction;
}

export interface UnscrolledDataGridPresentation extends DataGridPresentationBase {
  readonly scroll?: never;
}

export interface ScrollableDataGridPresentation extends DataGridPresentationBase {
  readonly scroll: ScrollState;
}

export type DataGridPresentation =
  | UnscrolledDataGridPresentation
  | ScrollableDataGridPresentation;

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
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type DataGridControlTransition = Exclude<DataGridTransition, { readonly kind: 'scroll' }>;

export interface DataGridActivateEvent {
  readonly kind: 'activate';
  readonly target:
    | { readonly kind: 'row'; readonly rowId: string }
    | { readonly kind: 'cell'; readonly cell: DataGridCell };
}
