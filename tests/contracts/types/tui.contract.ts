import { text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { defineTui, type TuiApp } from '@ismail-elkorchi/terminal-ui/tui';

interface IncrementMessage { readonly kind: 'increment' }
interface ResetMessage { readonly kind: 'reset' }
type Message = IncrementMessage | ResetMessage;
interface State { readonly count: number }

const app: TuiApp<State, Message> = defineTui<State, Message>({
  id: 'contract',
  init: () => ({ count: 0 }),
  update: (state, message) => message.kind === 'increment'
    ? {
        state: { count: state.count + 1 },
        focus: { kind: 'element', elementId: 'counter' },
        effects: [{
          id: 'edit',
          concurrency: 'keep-first',
          run: async (context) => {
            await context.withTerminalSuspended(() => Promise.resolve());
            return { kind: 'none' };
          }
        }]
      }
    : { state: { count: 0 } },
  view: (state, context): Element<Message> => {
    const columns = context.terminalSize.columns;
    return text(`${String(state.count)}/${String(columns)}`);
  }
});

// @ts-expect-error update messages must match the declared message union
const invalidApp: TuiApp<State, Message> = defineTui<State, { readonly kind: 'other' }>({
  id: 'invalid',
  init: () => ({ count: 0 }),
  update: (state) => ({ state }),
  view: (state) => text(String(state.count))
});

void app;
void invalidApp;
