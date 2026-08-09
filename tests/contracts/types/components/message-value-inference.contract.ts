import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

// @ts-expect-error action handlers must resolve explicitly
button({ id: 'undefined', label: 'Undefined', onAction: () => undefined });
const nullMessage = button({ id: 'null', label: 'Null', onAction: () => null });
const booleanMessage = button({ id: 'boolean', label: 'Boolean', onAction: () => true as const });
const numberMessage = button({ id: 'number', label: 'Number', onAction: () => 42 as const });
const stringMessage = button({ id: 'string', label: 'String', onAction: () => 'save' as const });
const arrayMessage = button({ id: 'array', label: 'Array', onAction: () => ['save'] as readonly string[] });
const tupleMessage = button({ id: 'tuple', label: 'Tuple', onAction: () => ['save', 1] as const });
const objectMessage = button({ id: 'object', label: 'Object', onAction: () => ({ kind: 'save' } as const) });
export type _Null = Assert<Equal<MessageOf<typeof nullMessage>, null>>;
export type _Boolean = Assert<Equal<MessageOf<typeof booleanMessage>, true>>;
export type _Number = Assert<Equal<MessageOf<typeof numberMessage>, 42>>;
export type _String = Assert<Equal<MessageOf<typeof stringMessage>, 'save'>>;
export type _Array = Assert<Equal<MessageOf<typeof arrayMessage>, readonly string[]>>;
export type _Tuple = Assert<Equal<MessageOf<typeof tupleMessage>, readonly ['save', 1]>>;
export type _Object = Assert<Equal<MessageOf<typeof objectMessage>, { readonly kind: 'save' }>>;
