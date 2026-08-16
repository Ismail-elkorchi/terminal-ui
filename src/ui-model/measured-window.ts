import type { MeasuredCollectionItem } from './measured-collection.ts';

/** @beta */
export interface MeasuredWindowAnchor {
  readonly itemId: string;
  readonly rowWithinItem: number;
  readonly viewportRow: number;
}

/** @beta */
export interface MeasuredWindowEntry<TValue> {
  readonly item: MeasuredCollectionItem<TValue>;
  readonly itemIndex: number;
  readonly startRowIndex: number;
  readonly endRowIndexExclusive: number;
  readonly rowOffset: number;
  readonly clippedRowsBefore: number;
  readonly visibleRows: number;
}

/** @beta */
export interface MeasuredWindowOptions {
  readonly viewportRows: number;
  readonly offsetRow?: number;
  readonly activeId?: string;
  readonly anchor?: MeasuredWindowAnchor;
}

/** @beta */
export interface MeasuredWindow<TValue> {
  readonly entries: readonly MeasuredWindowEntry<TValue>[];
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly offsetRow: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

/** @beta */
export interface MeasuredAnchorAtOptions {
  readonly offsetRow: number;
  readonly viewportRow?: number;
}
