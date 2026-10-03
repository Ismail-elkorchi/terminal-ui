declare const collectionOrderReaderBrand: unique symbol;

/** A persistent identity and order receipt. Item payloads must be immutable. */
export interface CollectionOrderReader<T> {
  readonly [collectionOrderReaderBrand]: T;
  readonly kind: 'ordered-source';
  readonly count: number;
  readonly enabledCount: number;
  readonly itemAt: (rank: number) => T | undefined;
  readonly itemById: (id: string) => T | undefined;
  readonly rank: (id: string) => number | undefined;
  readonly enabledAt: (rank: number) => T | undefined;
  readonly enabledRank: (id: string) => number | undefined;
  readonly window: (start: number, end: number) => readonly T[];
  readonly values: (start?: number, end?: number) => IterableIterator<T>;
}
