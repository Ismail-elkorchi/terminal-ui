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
  activityFeed,
  statusBar
} from '../../dist/components/index.js';
import {
  stack,
  surface
} from '../../dist/layout/index.js';

function view(state) {
  return surface(stack([
    activityFeed({
      id: 'activity',
      selected: state.selected,
      blocks: state.blocks,
      keys: { enter: { kind: 'advance' } }
    }),
    statusBar({ id: 'status', text: `Selected ${state.selected}` })
  ]), { id: 'root', border: { kind: 'single' } });
}

test('activity feed vertical slice maps generic activity blocks through runtime frames', async () => {
  const blocks = [
    { id: 'one', title: 'One', status: 'pending', collapsed: true },
    { id: 'two', title: 'Two', status: 'running', summary: 'In progress', collapsed: true },
    { id: 'three', title: 'Three', status: 'success', collapsed: true }
  ];
  const app = defineTui({
    id: 'activity-feed-slice',
    init: () => ({ blocks, selected: 0 }),
    update: (state, message) => ({
      state: { ...state, selected: message.kind === 'advance' ? 1 : state.selected },
      ...(message.kind === 'advance' ? { exit: {} } : {})
    }),
    view
  });
  const harness = createTerminalHarness({ viewport: { columns: 32, rows: 8 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state?.selected, 1);
  assert.equal(harness.frames().length, 2);
  assert.match(renderFramePlain(harness.frames()[0]), /› \[\+\] \[pending\] One/u);
  assert.match(renderFramePlain(harness.frames()[1]), /› \[\+\] \[running\] Two/u);
  assert.equal(harness.snapshot().root.id, 'root');
  assert.equal(findAccessibleNode(harness.snapshot(), 'activity')?.role, 'listbox');
  assert.equal(harness.restores().length, 1);
});
