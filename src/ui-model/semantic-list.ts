import type { Element, ElementMessage } from '../element/index.ts';
import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { ScrollEvent } from '../interaction/scroll.ts';

export interface SemanticListItem<TContent extends Element = Element> {
  readonly id: string;
  readonly content: TContent;
  readonly label?: string;
}

export interface ListViewItem<TContent extends Element = Element> extends SemanticListItem<TContent> {
  readonly disabled?: boolean;
}

export type ListViewPresentation = CollectionInteractionState;

export type ListViewTransition = CollectionInteractionAction | {
  readonly kind: 'scroll';
  readonly event: ScrollEvent;
};

export interface ListViewActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
  readonly itemIndex: number;
}

export type SemanticListMessage<TItems extends readonly SemanticListItem[]> = ElementMessage<
  TItems[number]['content']
>;
