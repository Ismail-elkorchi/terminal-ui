import type { ScrollEvent } from '../behavior/scroll.ts';

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
