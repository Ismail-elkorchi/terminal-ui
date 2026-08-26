import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { CollectionQuery } from '../text/query.ts';
import type { TextEditBuffer, TextEditOperation } from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';

export type SearchPickerQueryOptions = Omit<CollectionQuery, 'text'>;

interface SearchPickerViewBase {
  readonly input: TextEditBuffer;
  readonly query?: SearchPickerQueryOptions;
  readonly activeId?: string;
}

export interface UnscrolledSearchPickerView extends SearchPickerViewBase {
  readonly scroll?: never;
}

export interface ScrollableSearchPickerView extends SearchPickerViewBase {
  readonly scroll: ScrollState;
}

export type SearchPickerView =
  | UnscrolledSearchPickerView
  | ScrollableSearchPickerView;

export type SearchPickerTransition =
  | { readonly kind: 'setQuery'; readonly query: CollectionQuery }
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly transition: TextPointerTransition }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type SearchPickerControlTransition = Exclude<
  SearchPickerTransition,
  { readonly kind: 'scroll' }
>;

export interface SearchPickerAcceptEvent {
  readonly kind: 'accept';
  readonly id: string;
}
