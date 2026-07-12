import type { ScrollEvent } from '../behavior/scroll.ts';
import type { ScrollState } from '../behavior/scroll.ts';

export type TableSortDirection = 'ascending' | 'descending';

export interface TableSortState {
  readonly column: string;
  readonly direction: TableSortDirection;
}

export interface TablePresentation {
  readonly selected?: number;
  readonly selectedCell?: { readonly row: number; readonly column: number };
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly scroll?: ScrollState;
}

export type TableAction =
  | { readonly kind: 'selectRow'; readonly row: number }
  | { readonly kind: 'selectCell'; readonly row: number; readonly column: number }
  | { readonly kind: 'moveRow'; readonly delta: number }
  | { readonly kind: 'moveColumn'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstRow' }
  | { readonly kind: 'lastRow' }
  | { readonly kind: 'activate'; readonly row: number; readonly column?: number }
  | { readonly kind: 'sortBy'; readonly column: string }
  | { readonly kind: 'resizeColumn'; readonly column: string; readonly delta: number }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };
