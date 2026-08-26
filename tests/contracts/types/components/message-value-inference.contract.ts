import {
  button,
  type ButtonOptions,
  type DisclosureMessage,
  type Element,
} from '@ismail-elkorchi/terminal-ui/components';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

// @ts-expect-error action handlers must resolve explicitly
button({ id: 'undefined', label: 'Undefined', onPress: () => undefined });
// @ts-expect-error null is not an application message; ignoreMessage is the explicit no-message result
button({ id: 'null', label: 'Null', onPress: () => null });
// @ts-expect-error exported option contracts use the same non-null message domain
export type NullButtonOptions = ButtonOptions<null>;
// @ts-expect-error derived component message types use the same non-null message domain
export type NullDisclosureMessage = DisclosureMessage<null, Element>;
const booleanMessage = button({ id: 'boolean', label: 'Boolean', onPress: () => true as const });
const numberMessage = button({ id: 'number', label: 'Number', onPress: () => 42 as const });
const stringMessage = button({ id: 'string', label: 'String', onPress: () => 'save' as const });
const arrayMessage = button({ id: 'array', label: 'Array', onPress: () => ['save'] as readonly string[] });
const tupleMessage = button({ id: 'tuple', label: 'Tuple', onPress: () => ['save', 1] as const });
const objectMessage = button({ id: 'object', label: 'Object', onPress: () => ({ kind: 'save' } as const) });
export type _Boolean = Assert<Equal<MessageOf<typeof booleanMessage>, true>>;
export type _Number = Assert<Equal<MessageOf<typeof numberMessage>, 42>>;
export type _String = Assert<Equal<MessageOf<typeof stringMessage>, 'save'>>;
export type _Array = Assert<Equal<MessageOf<typeof arrayMessage>, readonly string[]>>;
export type _Tuple = Assert<Equal<MessageOf<typeof tupleMessage>, readonly ['save', 1]>>;
export type _Object = Assert<Equal<MessageOf<typeof objectMessage>, { readonly kind: 'save' }>>;
