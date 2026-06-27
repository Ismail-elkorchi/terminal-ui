import assert from 'node:assert/strict';
import test from 'node:test';

import { findAccessibleNode } from '../../dist/accessibility/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { defineTui, renderFrame, runTui } from '../../dist/tui/index.js';
import { activityFeed, box, statusBar, stack } from '../../dist/widgets/index.js';

function view(state) {
  return box(stack([
    activityFeed({
      id: 'activity',
      selected: state.selected,
      blocks: state.blocks,
      keyMap: { enter: { kind: 'advance' } }
    }),
    statusBar({ id: 'status', text: `Selected ${state.selected}` })
  ]), { id: 'root' });
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
  assert.match(renderFrame(harness.frames()[0]), /› \[\+\] \[pending\] One/u);
  assert.match(renderFrame(harness.frames()[1]), /› \[\+\] \[running\] Two/u);
  assert.equal(harness.snapshot().root.id, 'root');
  assert.equal(findAccessibleNode(harness.snapshot(), 'activity')?.role, 'listbox');
  assert.equal(harness.restores().length, 1);
});
