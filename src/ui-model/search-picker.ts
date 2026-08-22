import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { CollectionQuery } from '../text/query.ts';
import type { TextEditBuffer, TextEditOperation } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

export type SearchPickerQueryOptions = Omit<CollectionQuery, 'text'>;

interface SearchPickerPresentationBase {
  readonly input: TextEditBuffer;
  readonly query?: SearchPickerQueryOptions;
  readonly activeId?: string;
}

export interface UnscrolledSearchPickerPresentation extends SearchPickerPresentationBase {
  readonly scroll?: never;
}

export interface ScrollableSearchPickerPresentation extends SearchPickerPresentationBase {
  readonly scroll: ScrollState;
}

export type SearchPickerPresentation =
  | UnscrolledSearchPickerPresentation
  | ScrollableSearchPickerPresentation;

export type SearchPickerTransition =
  | { readonly kind: 'setQuery'; readonly query: CollectionQuery }
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
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
