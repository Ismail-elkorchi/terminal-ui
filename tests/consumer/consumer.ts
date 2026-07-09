import { createScrollState, scrollReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import { button, text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { stack, surface } from '@ismail-elkorchi/terminal-ui/layout';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import { defineTui } from '@ismail-elkorchi/terminal-ui/tui';

type Message =
  | { readonly kind: 'increment' }
  | { readonly kind: 'scroll' };

interface State {
  readonly count: number;
}

function view(state: State): Element<Message> {
  return surface<Message>(stack<Message>([
    text(`Count: ${String(state.count)}`, { id: 'count', textRole: 'metric' }),
    button<Message>({ id: 'increment', label: 'Increment', onPress: { kind: 'increment' } })
  ], {
    id: 'content',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }]
  }), { id: 'root', variant: 'raised' });
}

const app = defineTui<State, Message>({
  id: 'packed-consumer',
  init: () => ({ count: 1 }),
  update: (state, message) => message.kind === 'increment'
    ? { state: { count: state.count + 1 } }
    : { state },
  view
});

const scroll = scrollReducer(createScrollState({
  contentRows: 20,
  viewportRows: 5
}), { kind: 'scrollLines', rows: 2 });
const output = renderFramePlain(renderElementFrame(view({ count: 1 }), {
  columns: 24,
  rows: 4
}));

if (app.id !== 'packed-consumer') throw new Error('The TUI entrypoint did not create the app.');
if (scroll.offsetRow !== 2) throw new Error('The behavior entrypoint did not update controlled state.');
if (!output.includes('Count: 1') || !output.includes('Increment')) {
  throw new Error(`The packed renderer output was incomplete: ${JSON.stringify(output)}`);
}

console.log('terminal-ui packed consumer passed');
