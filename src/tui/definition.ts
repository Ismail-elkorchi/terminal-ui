import type { TuiApp, TuiDefinition } from './types.ts';

export function defineTui<TState, TMessage>(
  definition: TuiDefinition<TState, TMessage>
): TuiApp<TState, TMessage> {
  return {
    id: definition.id ?? 'tui-app',
    definition
  };
}
