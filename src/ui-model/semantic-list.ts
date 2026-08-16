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

export interface ListViewRenderedItem<
  TContent extends Element<ElementMessageValue> = Element<ElementMessageValue>
> {
  readonly content: TContent;
  readonly label?: string;
  readonly disabled?: boolean;
}

export type ListViewItemRenderer<
  TValue,
  TContent extends Element<ElementMessageValue> = Element<ElementMessageValue>
> = (
  item: MeasuredCollectionItem<TValue>,
  itemIndex: number,
) => ListViewRenderedItem<TContent>;

export type ListViewMeasuredWindow<TValue> = MeasuredWindow<TValue>;

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
