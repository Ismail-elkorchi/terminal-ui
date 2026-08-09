import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiRuntime,
  defineTui,
  animationSource,
  intervalSource,
  timeoutSource
} from '../../dist/tui/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { text } from '../../dist/components/index.js';
import type { AnimationFrame } from '../../dist/tui/index.js';
import { waitUntil } from '../helpers/async.ts';

void test('intervalSource emits deterministic ticks through the terminal clock', async () => {
  interface State {
    readonly ticks: readonly number[];
  }
  interface Message {
    readonly tick: number;
  }
  const app = defineTui<State, Message>({
    id: 'interval-source',
    init: () => ({ ticks: [] }),
    update: (state, message) => ({ state: { ticks: [...state.ticks, message.tick] } }),
    subscriptions: () => [intervalSource('interval', 10, (tick) => ({ tick }))],
    view: (state) => text({ content: state.ticks.join(','), id: 'ticks' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(10);
  await waitUntil(() => runtime.state().ticks.length === 1);
  harness.clock.advance(10);
  await waitUntil(() => runtime.state().ticks.length === 2);
  await runtime.dispose();

  assert.deepEqual(runtime.state().ticks, [0, 1]);
});

void test('timeoutSource emits once after the configured clock delay', async () => {
  interface State {
    readonly ready: boolean;
    readonly count: number;
  }
  interface Message {
    readonly ready: boolean;
  }
  const app = defineTui<State, Message>({
    id: 'timeout-source',
    init: () => ({ ready: false, count: 0 }),
    update: (state) => ({ state: { ready: true, count: state.count + 1 } }),
    subscriptions: () => [timeoutSource('timeout', 5, { ready: true })],
    view: (state) => text({ content: state.ready ? 'ready' : 'waiting', id: 'ready-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(4);
  assert.deepEqual(runtime.state(), { ready: false, count: 0 });
  harness.clock.advance(1);
  await waitUntil(() => runtime.state().ready);
  harness.clock.advance(10);
  await Promise.resolve();
  await runtime.dispose();

  assert.deepEqual(runtime.state(), { ready: true, count: 1 });
});

void test('animationSource maps frames from fps to clock-driven intervals', async () => {
  interface State {
    readonly frames: readonly AnimationFrame[];
  }
  interface Message {
    readonly frame: AnimationFrame;
  }
  const app = defineTui<State, Message>({
    id: 'animation-source',
    init: () => ({ frames: [] }),
    update: (state, message) => ({ state: { frames: [...state.frames, message.frame] } }),
    subscriptions: () => [animationSource('animation', 20, (frame) => ({ frame }))],
    view: (state) => text({ content: state.frames.map((frame) => frame.frameIndex).join(','), id: 'frames' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(49);
  assert.deepEqual(runtime.state().frames, []);
  harness.clock.advance(1);
  await waitUntil(() => runtime.state().frames.length === 1);
  await runtime.dispose();

  assert.deepEqual(runtime.state().frames, [{
    frameIndex: 0,
    targetTime: 50,
    elapsed: 50,
    delta: 50,
    droppedFrames: 0
  }]);
});

void test('animationSource coalesces overruns to the latest due frame', async () => {
  interface State {
    readonly frames: readonly AnimationFrame[];
  }
  interface Message {
    readonly frame: AnimationFrame;
  }
  const app = defineTui<State, Message>({
    id: 'animation-overrun',
    init: () => ({ frames: [] }),
    update: (state, message) => ({ state: { frames: [...state.frames, message.frame] } }),
    subscriptions: () => [animationSource('animation', 20, (frame) => ({ frame }))],
    view: (state) => text({ content: String(state.frames.length), id: 'frame-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.resolve();
  harness.clock.advance(180);
  await waitUntil(() => runtime.state().frames.length === 1);
  await runtime.dispose();

  assert.deepEqual(runtime.state().frames, [{
    frameIndex: 2,
    targetTime: 150,
    elapsed: 180,
    delta: 180,
    droppedFrames: 2
  }]);
});
