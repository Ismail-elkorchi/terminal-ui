declare const elementBrand: unique symbol;
declare const elementMessageBrand: unique symbol;

export interface Element<TMessage = unknown> {
  readonly [elementBrand]: true;
  readonly [elementMessageBrand]?: TMessage;
}

export type ElementChildren<TMessage> = readonly Element<TMessage>[] | Element<TMessage>;
