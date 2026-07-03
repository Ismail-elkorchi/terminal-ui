import type { InputEvent } from '../input/index.ts';
import type { FocusPath } from './focus.ts';
import type { TuiKeyBinding, TuiKeyBindingPhase } from './types.ts';

export interface ResolveTuiKeyBindingInput<TState, TMessage> {
  readonly bindings: readonly TuiKeyBinding<TState, TMessage>[] | undefined;
  readonly phase: TuiKeyBindingPhase;
  readonly state: TState;
  readonly event: InputEvent;
  readonly key: string | undefined;
  readonly focusPath: FocusPath | undefined;
}

export function resolveTuiKeyBinding<TState, TMessage>(
  input: ResolveTuiKeyBindingInput<TState, TMessage>
): TMessage | undefined {
  if (input.key === undefined || input.bindings === undefined) return undefined;
  for (const binding of input.bindings) {
    if ((binding.phase ?? 'afterFocus') !== input.phase) continue;
    if (!binding.keys.includes(input.key)) continue;
    const context = {
      state: input.state,
      event: input.event,
      key: input.key,
      ...(input.focusPath === undefined ? {} : { focusPath: input.focusPath })
    };
    const enabled = typeof binding.enabled === 'function'
      ? binding.enabled(context)
      : binding.enabled;
    if (enabled === false) continue;
    const message = binding.toMessage === undefined ? binding.message : binding.toMessage(context);
    if (message !== undefined) return message;
  }
  return undefined;
}
