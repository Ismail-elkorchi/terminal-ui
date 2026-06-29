import assert from 'node:assert/strict';
import test from 'node:test';

import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  animationSource,
  createTuiRuntime,
  defineTui,
  intervalSource,
  timeoutSource
} from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';
import { waitUntil } from '../helpers/async.mjs';

test('intervalSource emits deterministic ticks through the terminal clock', async () => {
  const app = defineTui({
    id: 'interval-source',
    init: () => ({ ticks: [] }),
    update: (state, message) => ({ state: { ticks: [...state.ticks, message.tick] } }),
    subscriptions: () => [intervalSource('interval', 10, (tick) => ({ tick }))],
    view: (state) => text(state.ticks.join(','), { id: 'ticks' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(10);
  await waitUntil(() => runtime.getState()?.ticks.length === 1);
  harness.clock.advance(10);
  await waitUntil(() => runtime.getState()?.ticks.length === 2);
  await runtime.dispose();

  assert.deepEqual(runtime.getState()?.ticks, [0, 1]);
});

test('timeoutSource emits once after the configured clock delay', async () => {
  const app = defineTui({
    id: 'timeout-source',
    init: () => ({ ready: false, count: 0 }),
    update: (state) => ({ state: { ready: true, count: state.count + 1 } }),
    subscriptions: () => [timeoutSource('timeout', 5, { ready: true })],
    view: (state) => text(state.ready ? 'ready' : 'waiting', { id: 'ready-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(4);
  assert.deepEqual(runtime.getState(), { ready: false, count: 0 });
  harness.clock.advance(1);
  await waitUntil(() => runtime.getState()?.ready === true);
  harness.clock.advance(10);
  await Promise.resolve();
  await runtime.dispose();

  assert.deepEqual(runtime.getState(), { ready: true, count: 1 });
});

test('animationSource maps frames from fps to clock-driven intervals', async () => {
  const app = defineTui({
    id: 'animation-source',
    init: () => ({ frames: [] }),
    update: (state, message) => ({ state: { frames: [...state.frames, message.frame] } }),
    subscriptions: () => [animationSource('animation', 20, (frame) => ({ frame }))],
    view: (state) => text(state.frames.join(','), { id: 'frames' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(49);
  assert.deepEqual(runtime.getState()?.frames, []);
  harness.clock.advance(1);
  await waitUntil(() => runtime.getState()?.frames.length === 1);
  await runtime.dispose();

  assert.deepEqual(runtime.getState()?.frames, [0]);
});
