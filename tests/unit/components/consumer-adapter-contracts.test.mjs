import assert from 'node:assert/strict';
import test from 'node:test';

import { contextMenuView, menuTriggerView } from '../../../dist/behavior/index.js';
import { ignoreMessage } from '../../../dist/component/index.js';
import { button, commandInput, contextMenu, menuBar, menuTrigger, tabs, text, tooltip } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createSuggestionFixture } from '../../support/collection-fixtures.mjs';

const items = [{ kind: 'action', id: 'open', label: 'Open' }];
const menuCases = [
  { name: 'menuBar', create: menuBar, options: { id: 'bar', items, view: { kind: 'closed' } } },
  { name: 'contextMenu', create: contextMenu, options: { id: 'context', view: { kind: 'closed' } } },
  { name: 'menuTrigger', create: menuTrigger, options: { id: 'trigger', label: 'Actions', items, view: { kind: 'closed' } } },
];

for (const { name, create, options } of menuCases) {
  test(`${name} validates callbacks for active and unavailable instances`, () => {
    for (const availability of [{}, { disabled: true }, { inert: true }]) {
      assert.throws(() => create({ ...options, ...availability, onTransition: ignoreMessage, onActivate: 'invalid' }), /onActivate must be a function/u);
      assert.throws(() => create({ ...options, ...availability, onTransition: 'invalid' }), /onTransition must be a function/u);
    }
    for (const availability of [{ disabled: true }, { inert: true }]) {
      assert.throws(() => create({ ...options, ...availability, onActivate: 'invalid' }), /onActivate must be a function/u);
      assert.doesNotThrow(() => create({ ...options, ...availability }));
    }
  });
}

test('tabs validates optional close callbacks for active and unavailable instances', () => {
  const options = { id: 'tabs', state: {}, tabs: [{ id: 'first', label: 'First', panel: text({ content: 'First' }) }] };
  for (const availability of [{ onTransition: ignoreMessage }, { disabled: true }, { inert: true }]) {
    assert.throws(() => tabs({ ...options, ...availability, onClose: 'invalid' }), /onClose must be a function/u);
  }
});

test('commandInput validates optional callbacks even without an active transition handler', () => {
  const view = { input: { text: '', cursor: 0 }, open: false, ...createSuggestionFixture([]) };
  for (const availability of [{ onTransition: ignoreMessage }, { disabled: true }]) {
    assert.throws(() => commandInput({ id: 'command', view, ...availability, onSubmit: 'invalid' }), /onSubmit must be a function/u);
    assert.throws(() => commandInput({ id: 'command', view, ...availability, onContextMenu: 'invalid' }), /onContextMenu must be a function/u);
  }
});

test('public adapters keep private slots and unsupported states out of wider caller objects', () => {
  const injected = text({ content: 'Injected private child' });
  const view = { input: { text: 'Query', cursor: 0 }, open: false, ...createSuggestionFixture([]) };
  const cases = [
    {
      create: tooltip,
      options: {
        id: 'hint', content: 'Help', open: false,
        trigger: button({ id: 'actual-trigger', label: 'Actual trigger', onPress: ignoreMessage }),
        slots: { trigger: injected }, inert: true, disabled: true,
        onTransition: ignoreMessage,
      },
      expected: /Actual trigger/u,
    },
    {
      create: menuTrigger,
      options: { id: 'trigger', label: 'Actions', items, view: { kind: 'closed' }, slots: { popup: injected }, readOnly: true, onTransition: ignoreMessage },
      expected: /Actions/u,
    },
    {
      create: contextMenu,
      options: {
        id: 'context', title: 'Actions',
        view: contextMenuView(items, { kind: 'open', anchor: { kind: 'cursor', row: 1, column: 1 }, menu: { activePath: ['open'] } }),
        slots: { popup: injected }, readOnly: true, onTransition: ignoreMessage,
      },
      expected: /Open/u,
    },
    {
      create: commandInput,
      options: { id: 'command', view, slots: { suggestions: injected }, inert: true, busy: true, onTransition: ignoreMessage },
      expected: /Query/u,
    },
  ];
  for (const { create, options, expected } of cases) {
    const original = { ...options };
    Object.freeze(options);
    const output = renderFramePlain(renderElementFrame(create(options), { columns: 32, rows: 8 }));
    assert.match(output, expected);
    assert.doesNotMatch(output, /Injected private child/u);
    assert.deepEqual(options, original);
  }
});

test('menu adapters preserve implementation-child transition and activation payloads', async () => {
  const openCases = [
    { create: contextMenu, options: { id: 'context', title: 'Actions', view: contextMenuView(items, { kind: 'open', anchor: { kind: 'cursor', row: 1, column: 1 }, menu: { activePath: ['open'] } }) } },
    { create: menuTrigger, options: { id: 'trigger', label: 'Actions', items, view: menuTriggerView(items, { kind: 'open', active: 'open', menu: { activePath: ['open'] } }) } },
  ];
  for (const { create, options } of openCases) {
    const messages = [];
    const runtime = createTuiRuntime({
      app: defineTui({
        id: `${options.id}-adapter`,
        init: () => ({ state: undefined }),
        update: (state, message) => { messages.push(message); return { state }; },
        view: () => create({
          ...options,
          onTransition: transition => ({ kind: 'transition', transition }),
          onActivate: event => ({ kind: 'activation', event }),
        }),
      }),
      host: createMemoryTerminalHost({ terminalSize: { columns: 32, rows: 8 } }),
    });
    try {
      await runtime.start();
      for (const key of ['arrowDown', 'enter']) {
        await runtime.handleInput({ kind: 'key', key, modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
      }
      assert.ok(messages.some(message => message.kind === 'transition' && message.transition.kind === 'menu' && message.transition.transition.kind === 'move'));
      assert.ok(messages.some(message => message.kind === 'activation' && message.event.kind === 'activate' && message.event.id === 'open'));
    } finally {
      await runtime.dispose();
    }
  }
});
