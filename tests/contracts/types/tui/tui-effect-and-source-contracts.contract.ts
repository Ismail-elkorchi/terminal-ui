import {
  defineTui,
  reliableSourceMessage,
  replaceableSourceMessage,
} from '@ismail-elkorchi/terminal-ui/tui';
import { text } from '@ismail-elkorchi/terminal-ui/components';

export type Message =
  | { readonly kind: 'load' }
  | { readonly kind: 'loaded'; readonly value: string };

defineTui<{ readonly value: string }, Message>({
  id: 'typed-effects',
  init: () => ({ state: ({ value: '' }) }),
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
    async run(_context, sink) {
      await sink.emit(replaceableSourceMessage('refresh', { kind: 'loaded' as const, value: 'fresh' }));
    }
  }],
  view: (state) => text({ content: state.value })
});

defineTui<{ readonly value: string }, { readonly kind: 'noop' }>({
  // @ts-expect-error initialization is a synchronous state transition
  init: async () => ({ state: ({ value: '' }) }),
  update: (state) => ({ state }),
  view: (state) => text({ content: state.value })
});

defineTui({
  init: () => ({ state: ({ value: '' }) }),
  // @ts-expect-error updates cannot hold the serialized transition queue with a promise
  update: async (state: { readonly value: string }) => ({ state }),
  view: (state) => text({ content: state.value })
});

// @ts-expect-error asynchronous producer messages use the same non-null domain as component messages
reliableSourceMessage(null);

// @ts-expect-error absence is represented by an emission kind, not an undefined message
replaceableSourceMessage('missing', undefined);

defineTui({
  init: () => ({ state: ({ value: '' }) }),
  update: (state: { readonly value: string }) => ({ state }),
  subscriptions: () => [{
    id: 'raw-message',
    generation: 0,
    async run(_context, sink) {
      // @ts-expect-error event-source emissions must declare reliable or keyed replaceable admission
      await sink.emit({ kind: 'loaded' as const, value: 'fresh' });
    }
  }],
  view: (state) => text({ content: state.value })
});
