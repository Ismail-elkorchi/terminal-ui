import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { CollectionProjection, CollectionRecord } from './collection.ts';

export interface TableCollectionRecord<TRow> extends CollectionRecord {
  readonly row: TRow;
}

export type TableCollection<TRow> = CollectionProjection<TableCollectionRecord<TRow>>;

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

export type DataGridInteraction =
  | {
      readonly kind: 'row';
      readonly selectionMode: 'none' | 'single' | 'multiple';
      readonly activeRowId?: string;
      readonly selectedRowIds: readonly string[];
      readonly selectionAnchorId?: string;
    }
  | {
      readonly kind: 'cell';
      readonly selectionMode: 'none' | 'single' | 'multiple';
      readonly activeCell?: DataGridCell;
      readonly selectedCells: readonly DataGridCell[];
      readonly selectionAnchor?: DataGridCell;
    };

export interface DataGridPresentation extends TablePresentation {
  readonly interaction: DataGridInteraction;
  readonly scroll?: ScrollState;
}

export type DataGridTransition =
  | { readonly kind: 'setActiveRow'; readonly rowId: string }
  | { readonly kind: 'setActiveCell'; readonly cell: DataGridCell }
  | { readonly kind: 'moveRow'; readonly delta: number }
  | { readonly kind: 'moveColumn'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstRow' }
  | { readonly kind: 'lastRow' }
  | { readonly kind: 'commit'; readonly extend?: boolean; readonly toggle?: boolean }
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
