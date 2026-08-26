import type { MessageResolution } from '../interaction/message.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import type { ElementMessageValue } from '../element/types.ts';

export type ComponentMessage = ElementMessageValue;

export function mapComponentAction(
  action: unknown,
  mapper: ((value: unknown) => unknown) | undefined,
): MessageResolution<ComponentMessage> {
  if (action === undefined) {
    throw new TypeError(
      'Component action hook returned undefined. Return ignoreMessage() to ignore an event.',
    );
  }
  if (isIgnoredMessage(action)) return action;
  if (mapper === undefined) {
    throw new TypeError('Component action cannot be emitted without an onAction mapper.');
  }
  const message = mapper(action);
  if (message === undefined || message === null) {
    throw new TypeError(
      'Component action mapper returned null or undefined. Return ignoreMessage() to ignore an action.',
    );
  }
  return message;
}
