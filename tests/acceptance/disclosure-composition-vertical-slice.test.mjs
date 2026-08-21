import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  findAccessibleNode } from '../../dist/accessibility/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import {
  disclosure,
  statusBar,
  text
} from '../../dist/components/index.js';
import {
  column,
  surface
} from '../../dist/layout/index.js';

function view(state) {
  return surface(column([
    column(state.items.map((item) => disclosure({
        id: item.id,
        label: item.label,
        summary: [{ kind: 'text', text: item.status }],
        expanded: state.expandedId === item.id,
        onAction: () => ({ kind: 'select', id: item.id }),
        slots: { content: text({ content: item.detail, id: `${item.id}:detail` }) }
      })), { id: 'activity' }),
    statusBar({
      id: 'status',
      leading: [{
        id: 'selection',
        kind: 'text',
        text: `Selected ${state.expandedId}`
      }]
    })
  ]), { id: 'root', border: { kind: 'single' } });
}

test('disclosure composition models heterogeneous activity without a domain-specific feed', async () => {
  const items = [
    { id: 'one', label: 'One', status: 'pending', detail: 'Waiting' },
    { id: 'two', label: 'Two', status: 'running', detail: 'In progress' },
    { id: 'three', label: 'Three', status: 'success', detail: 'Complete' }
  ];
  const app = defineTui({
    id: 'disclosure-composition-slice',
    init: () => ({ state: ({ items, expandedId: 'one' }) }),
    update: (state, message) => ({
      state: { ...state, expandedId: message.id === 'one' ? 'two' : message.id },
      exit: {}
    }),
    view
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 32, rows: 8 } });
  harness.host.input('\r');
  const exit = await runTui(app, { host: harness.host });

  assert.equal(exit.status, 'completed');
  assert.equal(exit.state?.expandedId, 'two');
  assert.equal(harness.frames().length, 2);
  assert.match(renderFramePlain(harness.frames()[0]), /One pending/u);
  assert.match(renderFramePlain(harness.frames()[1]), /Two running/u);
  assert.match(renderFramePlain(harness.frames()[1]), /In progress/u);
  assert.equal(harness.snapshot().root.id, 'root');
  assert.equal(findAccessibleNode(harness.snapshot(), 'two:toggle')?.expanded, true);
  assert.equal(findAccessibleNode(harness.snapshot(), 'two:toggle')?.controls, 'two:content');
  assert.equal(findAccessibleNode(harness.snapshot(), 'one:toggle')?.controls, undefined);
  assert.equal(harness.restores().length, 1);
});
