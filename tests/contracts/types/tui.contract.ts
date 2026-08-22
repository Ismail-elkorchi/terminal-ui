import { text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import {
  defineTui,
  runTui,
  type TuiApp,
  type TuiRunResult
} from '@ismail-elkorchi/terminal-ui/tui';

interface IncrementMessage { readonly kind: 'increment' }
interface ResetMessage { readonly kind: 'reset' }
type Message = IncrementMessage | ResetMessage;
interface State { readonly count: number }

const app: TuiApp<State, Message> = defineTui<State, Message>({
  id: 'contract',
  init: () => ({ state: ({ count: 0 }) }),
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
    // @ts-expect-error application views do not receive terminal host authority
    const host = context.host;
    void host;
    return text({ content: `${String(state.count)}/${String(columns)}` });
  }
});

// @ts-expect-error update messages must match the declared message union
const invalidApp: TuiApp<State, Message> = defineTui<State, { readonly kind: 'other' }>({
  id: 'invalid',
  init: () => ({ state: ({ count: 0 }) }),
  update: (state) => ({ state }),
  view: (state) => text({ content: String(state.count) })
});

const arrayStateApp = defineTui<string[], IncrementMessage>({
  id: 'array-state',
  init: () => ({ state: [] }),
  update: (state) => ({ state }),
  view: (state) => text({ content: state.join(',') })
});

// @ts-expect-error null is not an application message; ignoreMessage is the no-message sentinel
const nullMessageApp = defineTui<State, null>({
  init: () => ({ state: ({ count: 0 }) }),
  update: (state) => ({ state }),
  view: (state) => text({ content: String(state.count) })
});

const runResult = runTui(app);
type AppRunResult = Awaited<typeof runResult>;
declare const resolvedRun: AppRunResult;
const publicRunResult: TuiRunResult<State> = resolvedRun;
// @ts-expect-error operational failures reject instead of resolving from runTui
const resolvedError: Extract<AppRunResult, { readonly status: 'error' }> = resolvedRun;

void app;
void invalidApp;
void arrayStateApp;
void nullMessageApp;
void publicRunResult;
void resolvedError;
