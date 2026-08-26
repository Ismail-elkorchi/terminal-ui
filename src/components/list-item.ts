import type { Element, ElementMessage, ElementMessageValue } from '../element/index.ts';
import type { MeasuredCollectionItem } from '../collection/measured-collection.ts';

export interface SemanticListItem<TContent extends Element = Element> {
  readonly id: string;
  readonly content: TContent;
  readonly label?: string;
}

/** @beta */
export interface ListViewItemContent<
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
) => ListViewItemContent<TContent>;

export type SemanticListMessage<TItems extends readonly SemanticListItem[]> = ElementMessage<
  TItems[number]['content']
>;
