import { button, textInput, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/interaction';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const undefinedMessage = button({ id: 'undefined', label: 'Undefined', onPress: () => undefined });
const nullMessage = button({ id: 'null', label: 'Null', onPress: () => null });
const booleanMessage = button({ id: 'boolean', label: 'Boolean', onPress: () => true as const });
const numberMessage = button({ id: 'number', label: 'Number', onPress: () => 42 as const });
const stringMessage = button({ id: 'string', label: 'String', onPress: () => 'save' as const });
const arrayMessage = button({ id: 'array', label: 'Array', onPress: () => ['save'] as readonly string[] });
const tupleMessage = button({ id: 'tuple', label: 'Tuple', onPress: () => ['save', 1] as const });
const objectMessage = button({ id: 'object', label: 'Object', onPress: () => ({ kind: 'save' } as const) });
const modified = textInput({
  id: 'modified',
  presentation: { value: '', cursor: 0 },
  keys: {
    enter: () => ignoreMessage(),
    modified: [{
      trigger: { kind: 'key', key: 's', modifiers: { ctrl: true } },
      onKey: () => ({ kind: 'save' } as const)
    }]
  }
});

export type _Undefined = Assert<Equal<MessageOf<typeof undefinedMessage>, undefined>>;
export type _Null = Assert<Equal<MessageOf<typeof nullMessage>, null>>;
export type _Boolean = Assert<Equal<MessageOf<typeof booleanMessage>, true>>;
export type _Number = Assert<Equal<MessageOf<typeof numberMessage>, 42>>;
export type _String = Assert<Equal<MessageOf<typeof stringMessage>, 'save'>>;
export type _Array = Assert<Equal<MessageOf<typeof arrayMessage>, readonly string[]>>;
export type _Tuple = Assert<Equal<MessageOf<typeof tupleMessage>, readonly ['save', 1]>>;
export type _Object = Assert<Equal<MessageOf<typeof objectMessage>, { readonly kind: 'save' }>>;
export type _Modified = Assert<Equal<MessageOf<typeof modified>, { readonly kind: 'save' }>>;
