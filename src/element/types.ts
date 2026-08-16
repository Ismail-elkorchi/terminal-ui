declare const elementBrand: unique symbol;
declare const elementMessageBrand: unique symbol;

export type ElementMessageValue = NonNullable<unknown>;

export interface ElementValue {
  readonly [elementBrand]: true;
}

export interface Element<out TMessage = never> extends ElementValue {
  readonly [elementMessageBrand]: TMessage;
}

export type ElementChildren = readonly ElementValue[] | ElementValue;

export type ElementMessage<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;

export type ElementChildrenMessage<TChildren> =
  TChildren extends readonly ElementValue[]
    ? ElementMessage<TChildren[number]>
    : ElementMessage<TChildren>;
