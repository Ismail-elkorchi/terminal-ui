import { matchesInputTrigger } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { TuiKeyBinding, TuiKeyBindingPhase } from './types.ts';
import { ignoreMessage, isIgnoredMessage } from '../interaction/message.ts';
import type { MessageResolution } from '../interaction/message.ts';

export interface ResolveTuiKeyBindingInput<TState, TMessage> {
  readonly bindings: readonly TuiKeyBinding<TState, TMessage>[] | undefined;
  readonly phase: TuiKeyBindingPhase;
  readonly state: TState;
  readonly event: InputEvent;
  readonly focusPath: FocusPath | undefined;
}

export function resolveTuiKeyBinding<TState, TMessage>(
  input: ResolveTuiKeyBindingInput<TState, TMessage>
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
    if (enabled === false) continue;
    const message = 'toMessage' in binding ? binding.toMessage(context) : binding.message;
    if (!isIgnoredMessage(message)) return message;
  }
  return ignoreMessage();
}
