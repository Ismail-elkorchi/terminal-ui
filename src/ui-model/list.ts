import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { CollectionInteractionIndex } from '../interaction/collection.ts';
import type {
  CollectionProjection,
  CollectionRecord,
  CompleteCollectionProjection,
  WindowedCollectionProjection
} from './collection.ts';

export interface ListboxOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export type ListboxOptionProjector<TValue> = (value: TValue, index: number) => ListboxOption;

export interface ListboxCollectionRecord<TValue> extends CollectionRecord {
  readonly value: TValue;
  readonly item: ListboxOption & { readonly disabled: boolean };
}

export type ListboxCollection<TValue> = CollectionProjection<ListboxCollectionRecord<TValue>>;
export type CompleteListboxCollection<TValue> = CompleteCollectionProjection<ListboxCollectionRecord<TValue>>;
export type WindowedListboxCollection<TValue> = WindowedCollectionProjection<ListboxCollectionRecord<TValue>>;

export interface ListboxViewEntry<TValue> {
  readonly id: string;
  readonly sourceIndex: number;
  readonly visibleIndex: number;
  readonly selectableIndex?: number;
  readonly value: TValue;
  readonly item: ListboxCollectionRecord<TValue>['item'];
}

export interface PreparedListboxView<TValue> {
  readonly kind: 'listbox-view';
  readonly source: ListboxCollection<TValue>;
  readonly query: Required<import('./query.ts').CollectionQuery>;
  readonly entries: readonly ListboxViewEntry<TValue>[];
  readonly selectable: readonly ListboxViewEntry<TValue>[];
  readonly interactionIndex: CollectionInteractionIndex;
  readonly startIndex: number;
  readonly totalCount: number;
}

export interface UnscrolledListboxPresentation extends CollectionInteractionState {
  readonly scroll?: never;
}

export interface ScrollableListboxPresentation extends CollectionInteractionState {
  readonly scroll: ScrollState;
}

export type ListboxPresentation =
  | UnscrolledListboxPresentation
  | ScrollableListboxPresentation;

export type ListboxTransition =
  | CollectionInteractionAction
  | { readonly kind: 'pageActive'; readonly delta: -1 | 1 }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type ListboxControlTransition = Exclude<ListboxTransition, { readonly kind: 'scroll' }>;

export interface ListboxActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}
