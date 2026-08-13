import type { Element, ElementMessage } from '../element/index.ts';
import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';

export interface SemanticListItem<TContent extends Element = Element> {
  readonly id: string;
  readonly content: TContent;
  readonly label?: string;
}

export interface ListViewRecord<TContent extends Element = Element> extends SemanticListItem<TContent> {
  readonly itemIndex: number;
  readonly startRow: number;
  readonly rowCount: number;
  readonly disabled?: boolean;
}

/** A caller-owned, variable-height window over a larger list view. */
export interface ListViewProjection<TContent extends Element = Element> {
  readonly records: readonly ListViewRecord<TContent>[];
  readonly totalCount: number;
  readonly totalRows: number;
}

export interface UnscrolledListViewPresentation extends CollectionInteractionState {
  readonly scroll?: never;
}

export interface ScrollableListViewPresentation extends CollectionInteractionState {
  readonly scroll: ScrollState;
}

export type ListViewPresentation =
  | UnscrolledListViewPresentation
  | ScrollableListViewPresentation;

export type ListViewTransition = CollectionInteractionAction | {
  readonly kind: 'scroll';
  readonly event: ScrollEvent;
};

export type ListViewControlTransition = Exclude<
  ListViewTransition,
  { readonly kind: 'scroll' }
>;

export interface ListViewActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}

export type SemanticListMessage<TItems extends readonly SemanticListItem[]> = ElementMessage<
  TItems[number]['content']
>;
