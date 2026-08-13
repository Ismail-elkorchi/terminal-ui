import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { CollectionQuery } from './query.ts';

export interface SearchPickerPresentation {
  readonly query: CollectionQuery;
  readonly activeId?: string;
  readonly scroll?: ScrollState;
}

export type SearchPickerTransition =
  | { readonly kind: 'setQuery'; readonly query: CollectionQuery }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type SearchPickerControlTransition = Exclude<
  SearchPickerTransition,
  { readonly kind: 'scroll' }
>;

export interface SearchPickerAcceptEvent {
  readonly kind: 'accept';
  readonly id: string;
}
