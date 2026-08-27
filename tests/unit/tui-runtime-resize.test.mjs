import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

test('defineTui rejects a non-callable resizeMessage', () => {
  assert.throws(() => defineTui({
    id: 'invalid-resize-mapper',
    init: () => ({ state: 0 }),
    resizeMessage: true,
    update: (state) => ({ state }),
    view: (state) => text({ content: String(state) })
  }), /resizeMessage must be a function/u);
});

test('resize messages reduce application state before the resized frame is committed', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'resize-message-test',
    init: () => ({ state: { columns: 20, previousColumns: 20 } }),
    resizeMessage: (_state, context) => ({
      columns: context.terminalSize.columns,
      previousColumns: context.previousTerminalSize.columns
    }),
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: `${String(state.previousColumns)}>${String(state.columns)}` })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.resize({ columns: 40, rows: 5 });

    assert.deepEqual(runtime.state(), { columns: 40, previousColumns: 20 });
    assert.match(renderFramePlain(runtime.frame()), /20>40/u);
  } finally {
    await runtime.dispose();
  }
});

test('resize messages require an explicit ignored-message result', async (t) => {
  for (const invalid of [undefined, null]) {
    await t.test(String(invalid), async () => {
      const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
      const app = defineTui({
        id: `invalid-resize-message-${String(invalid)}`,
        init: () => ({ state: 0 }),
        resizeMessage: () => invalid,
        update: (state) => ({ state: state + 1 }),
        view: (state) => text({ content: String(state) })
      });
      const runtime = createTuiRuntime({ app, host });
      try {
        await runtime.start();
        await assert.rejects(
          runtime.resize({ columns: 21, rows: 5 }),
          /TUI resizeMessage cannot return null or undefined/u
        );
        assert.equal(runtime.state(), 0);
        assert.equal(runtime.frame().width, 20);
      } finally {
        await runtime.dispose();
      }
    });
  }
});

test('resize messages can explicitly ignore a changed terminal size', async () => {
  let updates = 0;
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'ignored-resize-message',
    init: () => ({ state: 0 }),
    resizeMessage: () => ignoreMessage(),
    update: (state) => {
      updates += 1;
      return { state: state + 1 };
    },
    view: (state) => text({ content: String(state) })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.resize({ columns: 21, rows: 5 });

    assert.equal(updates, 0);
    assert.equal(runtime.state(), 0);
    assert.equal(runtime.frame().width, 21);
  } finally {
    await runtime.dispose();
  }
});

test('unchanged terminal sizes do not invoke resize messages', async () => {
  let calls = 0;
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'unchanged-resize-message',
    init: () => ({ state: 0 }),
    resizeMessage: () => {
      calls += 1;
      return 1;
    },
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: String(state) })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    const initialFrame = await runtime.start();
    const resizeFrame = await runtime.resize({ columns: 20, rows: 5 });

    assert.equal(calls, 0);
    assert.equal(runtime.state(), 0);
    assert.equal(resizeFrame, initialFrame);
  } finally {
    await runtime.dispose();
  }
});

test('redraw maps a host size change before committing its frame', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'redraw-resize-message',
    init: () => ({ state: 20 }),
    resizeMessage: (_state, context) => context.terminalSize.columns,
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: String(state) })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await host.terminalSizeControl.setTerminalSize({ columns: 21, rows: 5 });
    await runtime.redraw();

    assert.equal(runtime.state(), 21);
    assert.equal(runtime.frame().width, 21);
    assert.match(renderFramePlain(runtime.frame()), /21/u);
  } finally {
    await runtime.dispose();
  }
});

test('the runtime owns terminal sizes before resize work is queued', async () => {
  const observations = [];
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'owned-resize-size',
    init: () => ({ state: 0 }),
    resizeMessage: (_state, context) => {
      observations.push({
        previousColumns: context.previousTerminalSize.columns,
        columns: context.terminalSize.columns,
        previousFrozen: Object.isFrozen(context.previousTerminalSize),
        frozen: Object.isFrozen(context.terminalSize)
      });
      return observations.length;
    },
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: String(state) })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    const first = { columns: 21, rows: 5 };
    const resizing = runtime.resize(first);
    first.columns = 33;
    await resizing;
    first.columns = 77;
    await runtime.resize({ columns: 22, rows: 5 });

    assert.deepEqual(observations, [
      { previousColumns: 20, columns: 21, previousFrozen: true, frozen: true },
      { previousColumns: 21, columns: 22, previousFrozen: true, frozen: true }
    ]);
  } finally {
    await runtime.dispose();
  }
});

test('the runtime owns the initial size returned by its host', async () => {
  const initialSize = { columns: 20, rows: 5 };
  const host = createMemoryTerminalHost();
  host.getTerminalSize = () => initialSize;
  const app = defineTui({
    id: 'owned-initial-size',
    init: (context) => ({
      state: {
        columns: context.terminalSize.columns,
        frozen: Object.isFrozen(context.terminalSize)
      }
    }),
    update: (state) => ({ state }),
    view: (state) => text({ content: String(state.columns) })
  });
  const runtime = createTuiRuntime({ app, host });
  initialSize.columns = 77;
  try {
    await runtime.start();

    assert.deepEqual(runtime.state(), { columns: 20, frozen: true });
    assert.equal(runtime.frame().width, 20);
  } finally {
    await runtime.dispose();
  }
});

test('invalid terminal sizes are rejected before invoking application code', async () => {
  let calls = 0;
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const app = defineTui({
    id: 'invalid-resize-size',
    init: () => ({ state: 0 }),
    resizeMessage: () => {
      calls += 1;
      return 1;
    },
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: String(state) })
  });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    for (const terminalSize of [
      { columns: Number.NaN, rows: 5 },
      { columns: 0, rows: 5 },
      { columns: 10_001, rows: 5 },
      { columns: 1_001, rows: 1_000 }
    ]) {
      await assert.rejects(runtime.resize(terminalSize), /TUI terminal size/u);
    }

    assert.equal(calls, 0);
    assert.equal(runtime.state(), 0);
    assert.equal(runtime.frame().width, 20);
  } finally {
    await runtime.dispose();
  }
});

test('disposal prevents a resize message waiting on runtime context', async () => {
  let calls = 0;
  let capabilityReads = 0;
  let disposing;
  let runtime;
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 5 } });
  const capabilities = await host.getCapabilities();
  host.getCapabilities = () => ({
    then(resolve) {
      capabilityReads += 1;
      if (capabilityReads === 2) disposing = runtime.dispose();
      resolve(capabilities);
    }
  });
  const app = defineTui({
    id: 'disposed-resize-message',
    init: () => ({ state: 0 }),
    resizeMessage: () => {
      calls += 1;
      return 1;
    },
    update: (_state, message) => ({ state: message }),
    view: (state) => text({ content: String(state) })
  });
  runtime = createTuiRuntime({ app, host });
  await runtime.start();

  await assert.rejects(runtime.resize({ columns: 21, rows: 5 }), /disposed/u);
  await disposing;
  assert.equal(capabilityReads, 2);
  assert.equal(calls, 0);
});
