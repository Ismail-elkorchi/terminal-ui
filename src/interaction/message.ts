const ignoredMessageBrand: unique symbol = Symbol('terminal-ui.ignored-message');

export type TuiMessageSource = 'input' | 'signal' | 'timer' | 'external' | 'effect';

export interface IgnoredMessage {
  readonly [ignoredMessageBrand]: true;
}

export type MessageResolution<TMessage> = TMessage | IgnoredMessage;

const ignored: IgnoredMessage = Object.freeze({ [ignoredMessageBrand]: true as const });

export function ignoreMessage(): IgnoredMessage {
  return ignored;
}

export function isIgnoredMessage(value: unknown): value is IgnoredMessage {
  return value === ignored;
}
