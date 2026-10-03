import assert from 'node:assert/strict';
import test from 'node:test';
import { createListboxCollection, createListboxView, listboxReducer, visibleListboxEntries } from '../../../dist/behavior/index.js';
import { listbox } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementSnapshot } from '../../../dist/testing/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const selection = { mode: 'single' };
const keyDown = {
  kind: 'key',
  key: 'arrowDown',
  modifiers: { ctrl: false, alt: false, shift: false, meta: false },
  eventType: 'press',
  location: 'standard',
};

test('listbox painting, keyboard navigation, and matches use one ranked projection', async () => {
  let mapped = 0;
  const collection = createListboxCollection([
    { id: 'later', label: 'xxa' },
    { id: 'first', label: 'a' },
  ], (item) => {
    mapped += 1;
    return item;
  });
  const query = { text: 'a', mode: 'contains' };
  const options = { collection, query, view: createListboxView(collection, { query }) };
  const initial = { activeId: 'first', selection };
  const app = defineTui({
    id: 'ranked-listbox',
    init: () => ({ state: initial }),
    update: (state, transition) => ({ state: listboxReducer(state, transition, options) }),
    view: (state) => listbox({
      id: 'items',
      meta: { accessibleName: 'Items' },
      ...options,
      state,
      onTransition: (transition) => transition,
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 3 } }) });
  await runtime.start();
  assert.deepEqual(visibleListboxEntries(options).map((entry) => entry.id), ['first', 'later']);
  const plain = renderFramePlain(runtime.frame());
  assert.ok(plain.indexOf('a') < plain.indexOf('xxa'), plain);
  await runtime.handleInput(keyDown);
  assert.equal(runtime.state().activeId, 'later');
  assert.equal(mapped, 2, 'owned source is normalized once across update and view');
  await runtime.dispose();
});

test('listbox query can match across label and description', () => {
  const collection = createListboxCollection([
    { id: 'entry', label: 'alpha', description: 'beta' },
  ], (item) => item);
  const query = { text: 'alpha beta', mode: 'contains' };
  const options = { collection, query, view: createListboxView(collection, { query }) };
  assert.deepEqual(visibleListboxEntries(options).map((entry) => entry.id), ['entry']);
  const rendered = renderElementSnapshot({
    terminalSize: { columns: 25, rows: 2 },
    element: listbox({
      id: 'boundary',
      meta: { accessibleName: 'Boundary' },
      ...options,
      state: { selection },
      onTransition: (transition) => transition,
    }),
  });
  assert.match(rendered.plainTextFrame, /alpha/u);
});

test('windowed listbox preserves server-owned rows and order', () => {
  const collection = createListboxCollection([
    { id: 'server-result', label: 'visible' },
  ], (item) => item, {
    startIndex: 40,
    totalCount: 100,
    scope: { kind: 'query', query: { text: 'elsewhere', mode: 'contains' } },
  });
  const entries = visibleListboxEntries({ collection, view: createListboxView(collection) });
  assert.deepEqual(entries.map((entry) => [entry.id, entry.itemIndex]), [['server-result', 40]]);
  const rendered = renderElementSnapshot({
    terminalSize: { columns: 15, rows: 2 },
    element: listbox({
      id: 'window',
      meta: { accessibleName: 'Window' },
      collection,
      view: createListboxView(collection),
      state: { selection },
      onTransition: (transition) => transition,
    }),
  });
  assert.match(rendered.plainTextFrame, /visible/u);
});
