import { matchesInputTrigger } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { TuiInputBinding, TuiInputBindingPhase } from './types.ts';
import { ignoreMessage, isIgnoredMessage } from '../interaction/message.ts';
import type { MessageResolution } from '../interaction/message.ts';

export interface ResolveTuiInputBindingInput<TState, TMessage> {
  readonly bindings: readonly TuiInputBinding<TState, TMessage>[] | undefined;
  readonly phase: TuiInputBindingPhase;
  readonly state: TState;
  readonly event: InputEvent;
  readonly focusPath: FocusPath | undefined;
}

export function resolveTuiInputBinding<TState, TMessage>(
  input: ResolveTuiInputBindingInput<TState, TMessage>
): MessageResolution<TMessage> {
  if (input.bindings === undefined) return ignoreMessage();
  for (const binding of input.bindings) {
    if ((binding.phase ?? 'afterFocus') !== input.phase) continue;
    const trigger = binding.triggers.find((candidate) => matchesInputTrigger(candidate, input.event));
    if (trigger === undefined) continue;
    const context = {
      state: input.state,
      event: input.event,
      trigger,
      ...(input.focusPath === undefined ? {} : { focusPath: input.focusPath })
    };
    const enabled = typeof binding.enabled === 'function'
      ? binding.enabled(context)
      : binding.enabled;
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw new TypeError(
        `TUI input binding ${JSON.stringify(binding.id)} enabled predicate must return a boolean.`
      );
    }
    if (enabled === false) continue;
    const message = 'toMessage' in binding ? binding.toMessage(context) : binding.message;
    if (message === undefined || message === null) {
      throw new TypeError(
        `TUI input binding ${JSON.stringify(binding.id)} returned null or undefined. Return ignoreMessage() to ignore input.`
      );
    }
    if (!isIgnoredMessage(message)) return message;
  }
  return ignoreMessage();
}
