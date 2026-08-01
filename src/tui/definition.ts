import { inputTriggerIdentity } from '../input/index.ts';
import type { TuiApp, TuiDefinition } from './types.ts';

export function defineTui<TState, TMessage>(
  definition: TuiDefinition<TState, TMessage>
): TuiApp<TState, TMessage> {
  if (definition.transcript !== undefined && typeof definition.transcript !== 'boolean') {
    throw new TypeError('TUI transcript must be a boolean when provided.');
  }
  validateInputBindings(definition.inputBindings);
  return {
    id: definition.id ?? 'tui-app',
    definition
  };
}

function validateInputBindings<TState, TMessage>(
  bindings: readonly import('./types.ts').TuiInputBinding<TState, TMessage>[] | undefined
): void {
  const ids = new Set<string>();
  for (const binding of bindings ?? []) {
    if (binding.id.trim() === '') throw new TypeError('TUI input binding id must be non-empty.');
    if (ids.has(binding.id)) throw new TypeError(`TUI input binding id ${JSON.stringify(binding.id)} is duplicated.`);
    ids.add(binding.id);
    if (binding.triggers.length === 0) {
      throw new TypeError(`TUI input binding ${JSON.stringify(binding.id)} must define at least one trigger.`);
    }
    const triggers = new Set<string>();
    for (const trigger of binding.triggers) {
      const identity = inputTriggerIdentity(trigger);
      if (triggers.has(identity)) {
        throw new TypeError(`TUI input binding ${JSON.stringify(binding.id)} contains duplicate trigger ${identity}.`);
      }
      triggers.add(identity);
    }
  }
}
