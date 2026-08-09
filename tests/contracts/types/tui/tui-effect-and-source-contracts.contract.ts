import { defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { text } from '@ismail-elkorchi/terminal-ui/components';

export type Message =
  | { readonly kind: 'load' }
  | { readonly kind: 'loaded'; readonly value: string };

defineTui<{ readonly value: string }, Message>({
  id: 'typed-effects',
  init: () => ({ value: '' }),
  update: (state, message) => message.kind === 'load'
    ? {
        state,
        effects: [{
          id: 'load-value',
          concurrency: 'replace',
          async run() {
            return {
              kind: 'message' as const,
              message: { kind: 'loaded' as const, value: 'ready' }
            };
          }
        }]
      }
    : { state: { value: message.value } },
  subscriptions: () => [{
    id: 'refresh',
    generation: 0,
    delivery: 'latest',
    async *messages() {
      yield { kind: 'loaded' as const, value: 'fresh' };
    }
  }],
  view: (state) => text({ content: state.value })
});

defineTui<{ readonly value: string }, unknown>({
  // @ts-expect-error initialization is a synchronous state transition
  init: async () => ({ value: '' }),
  update: (state) => ({ state }),
  view: (state) => text({ content: state.value })
});

defineTui({
  init: () => ({ value: '' }),
  // @ts-expect-error updates cannot hold the serialized transition queue with a promise
  update: async (state: { readonly value: string }) => ({ state }),
  view: (state) => text({ content: state.value })
});

defineTui({
  init: () => ({ value: '' }),
  update: (state: { readonly value: string }) => ({ state }),
  // @ts-expect-error event sources must declare their backlog semantics
  subscriptions: () => [{
    id: 'missing-delivery',
    generation: 0,
    async *messages() {
      yield { kind: 'loaded' as const, value: 'fresh' };
    }
  }],
  view: (state) => text({ content: state.value })
});
