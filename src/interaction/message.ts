const ignoredMessageBrand: unique symbol = Symbol('terminal-ui.ignored-message');

export const tuiMessageSources = ['input', 'signal', 'timer', 'external', 'effect'] as const;

export type TuiMessageSource = typeof tuiMessageSources[number];

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
