declare const elementBrand: unique symbol;
declare const elementMessageBrand: unique symbol;

export interface Element<out TMessage = never> {
  readonly [elementBrand]: true;
  readonly [elementMessageBrand]: TMessage;
}

export type ElementChildren<TMessage = unknown> = readonly Element<TMessage>[] | Element<TMessage>;

export type ElementMessage<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;

export type ElementChildrenMessage<TChildren> =
  TChildren extends readonly Element<unknown>[]
    ? ElementMessage<TChildren[number]>
    : ElementMessage<TChildren>;
