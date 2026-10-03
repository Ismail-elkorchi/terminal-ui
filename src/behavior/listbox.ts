import type {
  CollectionItem,
  WindowedCollectionSnapshot,
} from '../collection/snapshot.ts';
import type {
  CollectionInteractionIndex,
  CollectionInteractionState,
  CollectionInteractionTransition,
} from '../interaction/collection-interaction.ts';
import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { QueryMatchRange } from '../text/query.ts';

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

declare const listboxSourceBrand: unique symbol;
export interface CompleteListboxCollection<TValue> {
  readonly [listboxSourceBrand]: TValue;
  readonly kind: 'listbox-source';
  readonly count: number;
  readonly startIndex: 0;
  readonly totalCount: number;
  readonly itemAt: (rank: number) => ListboxCollectionItem<TValue> | undefined;
  readonly itemById: (id: string) => ListboxCollectionItem<TValue> | undefined;
  readonly rank: (id: string) => number | undefined;
  readonly window: (start: number, end: number) => readonly ListboxCollectionItem<TValue>[];
}
export type ListboxCollection<TValue> = CompleteListboxCollection<TValue> | WindowedListboxCollection<TValue>;
export type ListboxCollectionChange<TValue> =
  | { readonly kind: 'append' | 'replace'; readonly value: TValue; readonly option: ListboxOption }
  | { readonly kind: 'remove'; readonly id: string };
export type WindowedListboxCollection<TValue> = WindowedCollectionSnapshot<ListboxCollectionItem<TValue>>;

export interface ListboxViewEntry<TValue> {
  readonly id: string;
  readonly itemIndex: number;
  readonly visibleIndex: number;
  readonly selectableIndex?: number;
  readonly value: TValue;
  readonly option: ListboxCollectionItem<TValue>['option'];
  readonly matches?: readonly QueryMatchRange[];
}

export interface ListboxView<TValue> {
  readonly kind: 'listbox-view';
  readonly source: ListboxCollection<TValue>;
  readonly query: import('../text/query.ts').CompiledCollectionQuery;
  readonly count: number;
  readonly entryAt: (rank: number) => ListboxViewEntry<TValue> | undefined;
  readonly entryById: (id: string) => ListboxViewEntry<TValue> | undefined;
  readonly window: (start: number, end: number) => readonly ListboxViewEntry<TValue>[];
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
