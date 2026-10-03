import { combineTuiResults } from './result.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { textArea } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { row } from '../layout/index.ts';
import { createTextDocument } from '../text/document.ts';
import { createTuiChild, type TuiChildMessage, type TuiChildState } from './child.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';

void test('committed layout messages keep sibling scopes and reject removed child generations', async () => {
  type Message = { readonly kind: 'layout'; readonly child: TuiChildMessage<number> } | { readonly kind: 'reopen' };
  interface State { readonly left: TuiChildState<number>; readonly right: TuiChildState<number>; }
  const delivered: TuiChildMessage<number>[] = [];
  const document = createTextDocument('one two three four');
  const child = createTuiChild({
    init: () => ({ state: 0 }),
    update: (_state: number, width: number) => ({ state: width }),
    view: () => textArea({ id: 'editor', meta: { accessibleName: 'Editor' },
      state: { document, caret: { position: { offset: 0, affinity: 'downstream' } } },
      onTransition: () => 0, onLayout: snapshot => snapshot.allocatedBounds.width,
    }),
  }, (message): Message => { delivered.push(message); return { kind: 'layout', child: message }; });
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 6 } }), app: defineTui<State, Message>({
    init: context => ({ state: { left: child.init({ id: 'left', generation: 1 }, context).state, right: child.init({ id: 'right', generation: 1 }, context).state } }),
    update(state, message, context) {
      if (message.kind === 'reopen') {
        const mounted = child.init({ id: 'left', generation: 2 }, context);
        return combineTuiResults({ ...state, left: mounted.state }, child.remove(state.left), mounted);
      }
      const key = message.child.id === 'left' ? 'left' : 'right';
      const updated = child.update(state[key], message.child, context);
      return { ...updated, state: { ...state, [key]: updated.state } };
    },
    view: (state, context) => row([child.view(state.left, context), child.view(state.right, context)], { sizes: [{ kind: 'fixed', cells: 10 }, { kind: 'fill' }] }),
  }) });
  try {
    await runtime.start();
    assert.deepEqual(delivered.map(message => [message.id, message.message]), [['left', 10], ['right', 30]]);
    assert.equal(runtime.state().left.state, 10);
    assert.equal(runtime.state().right.state, 30);
    await runtime.dispatch({ kind: 'reopen' });
    await runtime.dispatch({ kind: 'layout', child: { id: 'left', generation: 1, message: 123 } });
    assert.equal(runtime.state().left.state, 10);
    assert.equal(runtime.state().left.generation, 2);
    assert.equal(runtime.state().right.state, 30);
    await runtime.resize({ columns: 50, rows: 6 });
    assert.equal(runtime.state().right.state, 40);
  } finally { await runtime.dispose(); }
});
