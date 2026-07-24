import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
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
  readonly selectedRowId?: string;
  readonly selectedCell?: { readonly rowId: string; readonly columnIndex: number };
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
}

export interface TableScrollablePresentation extends TablePresentation {
  readonly scroll: ScrollState;
}

export type TableAction =
  | { readonly kind: 'selectRow'; readonly rowId: string; readonly rowIndex: number }
  | { readonly kind: 'selectCell'; readonly rowId: string; readonly rowIndex: number; readonly columnIndex: number }
  | { readonly kind: 'moveRow'; readonly delta: number }
  | { readonly kind: 'moveColumn'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstRow' }
  | { readonly kind: 'lastRow' }
  | { readonly kind: 'activate'; readonly rowId: string; readonly rowIndex: number; readonly columnIndex?: number }
  | { readonly kind: 'sortBy'; readonly columnId: string }
  | { readonly kind: 'resizeColumnBy'; readonly columnId: string; readonly delta: number }
  | { readonly kind: 'setColumnWidth'; readonly columnId: string; readonly width: number }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type TableControlAction = Exclude<TableAction, { readonly kind: 'scroll' }>;
