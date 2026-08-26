import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { CollectionInteractionTransition, CollectionInteractionState } from '../interaction/collection-interaction.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type {
  CollectionSnapshot,
  CollectionItem,
  CompleteCollectionSnapshot,
  WindowedCollectionSnapshot
} from '../collection/snapshot.ts';

export interface ListboxOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export type ListboxOptionMapper<TValue> = (value: TValue, index: number) => ListboxOption;

export interface ListboxCollectionItem<TValue> extends CollectionItem {
  readonly value: TValue;
  readonly option: ListboxOption & { readonly disabled: boolean };
}

export type ListboxCollection<TValue> = CollectionSnapshot<ListboxCollectionItem<TValue>>;
export type CompleteListboxCollection<TValue> = CompleteCollectionSnapshot<ListboxCollectionItem<TValue>>;
export type WindowedListboxCollection<TValue> = WindowedCollectionSnapshot<ListboxCollectionItem<TValue>>;

export interface ListboxViewEntry<TValue> {
  readonly id: string;
  readonly itemIndex: number;
  readonly visibleIndex: number;
  readonly selectableIndex?: number;
  readonly value: TValue;
  readonly option: ListboxCollectionItem<TValue>['option'];
}

export interface ListboxView<TValue> {
  readonly kind: 'listbox-view';
  readonly source: ListboxCollection<TValue>;
  readonly query: import('../text/query.ts').CompiledCollectionQuery;
  readonly entries: readonly ListboxViewEntry<TValue>[];
  readonly selectable: readonly ListboxViewEntry<TValue>[];
  readonly interactionIndex: CollectionInteractionIndex;
  readonly startIndex: number;
  readonly totalCount: number;
}

export interface UnscrolledListboxState extends CollectionInteractionState {
  readonly scroll?: never;
}

export interface ScrollableListboxState extends CollectionInteractionState {
  readonly scroll: ScrollState;
}

export type ListboxState =
  | UnscrolledListboxState
  | ScrollableListboxState;

export type ListboxTransition =
  | CollectionInteractionTransition
  | { readonly kind: 'pageActive'; readonly delta: -1 | 1 }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type ListboxControlTransition = Exclude<ListboxTransition, { readonly kind: 'scroll' }>;

export interface ListboxActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}
