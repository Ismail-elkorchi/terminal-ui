import type { Element, ElementMessage, ElementMessageValue } from '../element/index.ts';
import type { MeasuredCollectionItem } from './measured-collection.ts';
import type { MeasuredWindow } from './measured-window.ts';
import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';

export interface SemanticListItem<TContent extends Element = Element> {
  readonly id: string;
  readonly content: TContent;
  readonly label?: string;
}

/** @beta */
export interface ListViewRenderedItem<
  TContent extends Element<ElementMessageValue> = Element<ElementMessageValue>
> {
  readonly content: TContent;
  readonly label?: string;
  readonly disabled?: boolean;
}

/** @beta */
export type ListViewItemRenderer<
  TValue,
  TContent extends Element<ElementMessageValue> = Element<ElementMessageValue>
> = (
  item: MeasuredCollectionItem<TValue>,
  itemIndex: number,
) => ListViewRenderedItem<TContent>;

/** @beta */
export type ListViewMeasuredWindow<TValue> = MeasuredWindow<TValue>;

/** @beta */
export interface UnscrolledListViewPresentation extends CollectionInteractionState {
  readonly scroll?: never;
}

/** @beta */
export interface ScrollableListViewPresentation extends CollectionInteractionState {
  readonly scroll: ScrollState;
}

/** @beta */
export type ListViewPresentation =
  | UnscrolledListViewPresentation
  | ScrollableListViewPresentation;

/** @beta */
export type ListViewTransition = CollectionInteractionAction | {
  readonly kind: 'scroll';
  readonly event: ScrollEvent;
};

/** @beta */
export type ListViewControlTransition = Exclude<
  ListViewTransition,
  { readonly kind: 'scroll' }
>;

/** @beta */
export interface ListViewActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}

export type SemanticListMessage<TItems extends readonly SemanticListItem[]> = ElementMessage<
  TItems[number]['content']
>;
