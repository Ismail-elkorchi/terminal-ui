export type { ChoiceItem, LabeledItem, SearchEntry } from './item.ts';
export { assertStableIds } from './identity.ts';
export {
  appendMeasuredItems,
  createMeasuredCollection,
  measuredCollectionItemById,
  prependMeasuredItems,
  removeMeasuredItems,
  replaceMeasuredItem,
} from './measured-collection.ts';
export type {
  MeasuredCollection,
  MeasuredCollectionItem,
} from './measured-collection.ts';
export {
  isMeasuredWindow,
  measuredAnchorAt,
  measuredWindow,
} from './measured-window-operations.ts';
export type {
  MeasuredAnchorAtOptions,
  MeasuredWindow,
  MeasuredWindowAnchor,
  MeasuredWindowEntry,
  MeasuredWindowOptions,
} from './measured-window.ts';
export {
  collectionIds,
  collectionItemById,
  createCompleteCollection,
  createWindowedCollection,
  isCollectionSnapshot,
} from './snapshot.ts';
export type {
  CollectionItem,
  CollectionSnapshot,
  CollectionWindow,
  CollectionWindowScope,
  CollectionWindowScopeInput,
  CompleteCollectionSnapshot,
  WindowedCollectionSnapshot,
} from './snapshot.ts';
