import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeasuredFeedApp } from '../../examples/tui/measured-feed.ts';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { measurementRequests, measuredAnchorAt } from '../../dist/collection/index.js';

async function settle(runtime) {
  for (let turn = 0; turn < 200 && runtime.state().preparation.pending; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(runtime.state().preparation.pending, false);
  assert.equal(runtime.state().preparation.error, null);
  assert.equal(measurementRequests(runtime.state().measurements, 3).length, 0);
}

test('measured feed prepares visible rows outside render and settles scroll, resize and cancellation', async () => {
  const runtime = createTuiRuntime({ app: createMeasuredFeedApp(10000),
    host: createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 10 } }) });
  try {
    await runtime.start();
    assert.equal(runtime.state().preparation.pending, true);
    await settle(runtime);
    assert.ok(runtime.state().preparation.result.length <= 13);
    const anchor = measuredAnchorAt(runtime.state().measurements.collection, { offsetRow: 100 });
    await runtime.dispatch({ kind: 'scroll', offset: 100 });
    await settle(runtime);
    assert.deepEqual(measuredAnchorAt(runtime.state().measurements.collection, { offsetRow: runtime.state().measurements.offsetRow }), anchor);
    await runtime.resize({ columns: 20, rows: 8 });
    await runtime.resize({ columns: 30, rows: 6 });
    await settle(runtime);
    assert.equal(runtime.state().measurements.geometry.columns, 30);
    assert.equal(runtime.state().measurements.geometry.rows, 6);
    const beforeHeightChange = runtime.state().measurements.geometry;
    await runtime.resize({ columns: 30, rows: 8 });
    assert.notEqual(runtime.state().measurements.geometry, beforeHeightChange);
    assert.equal(runtime.state().measurements.geometry.rows, 8);
    await settle(runtime);
    assert.deepEqual(runtime.diagnostics(), []);
    await runtime.resize({ columns: 1, rows: 1 });
    await settle(runtime);
    await runtime.resize({ columns: 40, rows: 10 });
    await settle(runtime);
    const beforeKey = runtime.state().measurements.offsetRow;
    await runtime.handleInput({ kind: 'key', key: 'pageDown', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
    await settle(runtime);
    assert.ok(runtime.state().measurements.offsetRow > beforeKey);
    await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
    assert.equal(runtime.exit()?.status, 'completed');
  } finally {
    await runtime.dispose();
  }
});
