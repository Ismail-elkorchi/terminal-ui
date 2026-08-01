import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { pointerInteractionReducer } from '../../dist/behavior/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { custom } from '../../dist/component/index.js';
import { leafRendererDefinition } from '../helpers/custom-renderer.mjs';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { button, tree } from '../../dist/components/index.js';
import { overlay } from '../../dist/layout/index.js';

test('TUI runtime routes mouse events to elements under the pointer', async () => {
  const app = defineTui({
    id: 'mouse-routing',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: (state) => button({
      id: 'mouse-field',
      label: state.clicked ? 'clicked' : 'idle',
      onPress: () => ({ clicked: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'mouse-field:control',
    bounds: { row: 1, column: 1, width: 20, height: 3 },
    focus: { kind: 'focus', path: ['mouse-field'] },
    cursor: 'pointer',
    zIndex: 0
  });
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /clicked/);
});

test('TUI pointer click activates once on left release and ignores right click or wheel', async () => {
  const app = defineTui({
    id: 'pointer-router-events',
    init: () => ({ clicks: 0 }),
    update: (state, message) => ({ state: { clicks: state.clicks + message.clicks } }),
    view: (state) => button({
      id: 'pointer-field',
      label: `clicks ${state.clicks}`,
      onPress: () => ({ clicks: 1 })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const leftPress = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;1;1M' });
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<64;1;1M' });

  assert.equal(leftPress.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.equal(rightPress.results[0]?.handled, false);
  assert.notEqual(wheel.pending, undefined);
  const wheelResults = await runtime.flushInput();
  assert.equal(wheelResults[0]?.handled, false);
  assert.deepEqual(runtime.state(), { clicks: 1 });
});

test('built-in controls expose controlled pointer interaction without duplicate activation', async () => {
  const app = defineTui({
    id: 'controlled-pointer-interaction',
    init: () => ({ pointer: {}, activations: 0 }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointer: pointerInteractionReducer(state.pointer, message.action) } }
      : { state: { ...state, activations: state.activations + 1 } },
    view: (state) => button({
      id: 'controlled-button',
      label: 'Run',
      onPress: () => ({ kind: 'activate' }),
      pointer: {
        state: state.pointer,
        onAction: (action) => ({ kind: 'pointer', action })
      }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await handleInputChunkAndSettle(runtime, '\u001B[<35;2;1M');
  assert.deepEqual(runtime.state().pointer, { hoveredTargetId: 'controlled-button:control' });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  assert.deepEqual(runtime.state().pointer, {
    hoveredTargetId: 'controlled-button:control',
    pressedTargetId: 'controlled-button:control'
  });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), {
    pointer: { hoveredTargetId: 'controlled-button:control' },
    activations: 1
  });

  await handleInputChunkAndSettle(runtime, '\u001B[<35;20;2M');
  assert.deepEqual(runtime.state().pointer, {});
});

test('disabled controls expose neither activation nor synthetic pointer lifecycle targets', async () => {
  const app = defineTui({
    id: 'disabled-pointer-interaction',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => button({
      id: 'disabled-button',
      label: 'Disabled',
      disabled: true
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets ?? [], []);
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), { events: [] });
});

test('TUI pointer targets receive pointerDown and pointerUp lifecycle messages', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'pointer lifecycle' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer lifecycle' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'lifecycle-hit',
        bounds,
        accepts: ['pointerDown', 'pointerUp'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'pointer-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'pointer-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });

  assert.equal(press.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      {
        kind: 'pointerDown',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      },
      {
        kind: 'pointerUp',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      }
    ]
  });
});

test('TUI pointer click counts use clock, stable target identity, and cross-target reset', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'left right' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'click targets' };
    },
    hitTargets({ bounds }) {
      return [
        {
          id: 'left-click',
          bounds: { ...bounds, width: 4 },
          accepts: ['click'],
          message: (event) => ({ target: 'left', clickCount: event.clickCount })
        },
        {
          id: 'right-click',
          bounds: { ...bounds, column: bounds.column + 5, width: 5 },
          accepts: ['click'],
          message: (event) => ({ target: 'right', clickCount: event.clickCount })
        }
      ];
    }
  };
  const app = defineTui({
    id: 'pointer-click-counts',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'pointer-click-count-targets', renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  const click = async (column) => {
    await runtime.handleInput({
      kind: 'mouse', sequence: '', encoding: 'sgr', action: 'press', button: 'left',
      row: 1, column, rawCode: 0, modifiers: { shift: false, alt: false, ctrl: false }
    });
    await runtime.handleInput({
      kind: 'mouse', sequence: '', encoding: 'sgr', action: 'release', button: 'none',
      row: 1, column, rawCode: 0, modifiers: { shift: false, alt: false, ctrl: false }
    });
  };

  await runtime.start();
  await click(1);
  await click(6);
  await click(1);
  harness.clock.advance(501);
  await click(1);
  await click(1);

  assert.deepEqual(runtime.state().events, [
    { target: 'left', clickCount: 1 },
    { target: 'right', clickCount: 1 },
    { target: 'left', clickCount: 1 },
    { target: 'left', clickCount: 1 },
    { target: 'left', clickCount: 2 }
  ]);
});

test('TUI pointer hover emits enter leave and hover when crossing targets', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'left  right' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'hover lifecycle' };
    },
    hitTargets({ bounds }) {
      const accepts = ['enter', 'leave', 'hover'];
      return [
        {
          id: 'left-hit',
          bounds: { ...bounds, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        },
        {
          id: 'right-hit',
          bounds: { ...bounds, column: bounds.column + 6, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        }
      ];
    }
  };
  const app = defineTui({
    id: 'hover-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'hover-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const moveLeft = await handleInputChunkAndSettle(runtime, '\u001B[<35;2;1M');
  const moveRight = await handleInputChunkAndSettle(runtime, '\u001B[<35;8;1M');
  const moveOutside = await handleInputChunkAndSettle(runtime, '\u001B[<35;20;1M');

  assert.equal(moveLeft[0]?.handled, true);
  assert.equal(moveRight[0]?.handled, true);
  assert.equal(moveOutside[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'enter', targetId: 'left-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'left-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'left-hit', localColumn: 8 },
      { kind: 'enter', targetId: 'right-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'right-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'right-hit', localColumn: 14 }
    ]
  });
});

test('TUI pointer targets receive event-aware messages and horizontal wheel deltas', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'pointer target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'event-aware-hit',
        bounds,
        accepts: ['contextMenu', 'scroll'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          deltaRows: event.deltaRows,
          deltaColumns: event.deltaColumns,
          localRow: event.localRow,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'event-aware-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'event-aware-pointer', renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;2;1M' });
  const wheelRight = await runtime.handleInputChunk({ data: '\u001B[<67;3;1M' });

  assert.equal(rightPress.results[0]?.handled, true);
  assert.notEqual(wheelRight.pending, undefined);
  const wheelRightResults = await runtime.flushInput();
  assert.equal(wheelRightResults[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'contextMenu', button: 'right', deltaRows: 0, deltaColumns: 0, localRow: 1, localColumn: 2 },
      { kind: 'scroll', button: 'wheelRight', deltaRows: 0, deltaColumns: 1, localRow: 1, localColumn: 3 }
    ]
  });
});


test('TUI pointer drag routes to the captured origin target', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'drag target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'drag target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'drag-hit',
        bounds: { ...bounds, width: 4 },
        accepts: ['dragStart', 'dragEnd'],
        message: (event) => ({
          kind: event.kind,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'drag-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'drag-pointer', renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const drag = await handleInputChunkAndSettle(runtime, '\u001B[<32;10;1M');
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;10;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(drag[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'dragStart', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 },
      { kind: 'dragEnd', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 }
    ]
  });
});

test('TUI pointer motion drops stale drag samples before routing release', async () => {
  const renderer = {
    ...leafRendererDefinition,
    render({ state, bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: `events ${String(state)}` }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'coalesced drag target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'coalesced-drag-hit',
        bounds,
        accepts: ['dragStart', 'drag', 'dragEnd'],
        message: (event) => ({ kind: event.kind, column: event.column }),
        cursor: 'text'
      }];
    }
  };
  const app = defineTui({
    id: 'coalesced-drag-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: (state) => custom({ id: 'coalesced-drag', renderer, state: state.events.length })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  const write = harness.host.write.bind(harness.host);
  const firstWriteStarted = deferred();
  const releaseFirstWrite = deferred();
  let blockNextWrite = true;
  harness.host.write = async (output, context) => {
    if (blockNextWrite) {
      blockNextWrite = false;
      firstWriteStarted.release();
      await releaseFirstWrite.promise;
    }
    return write(output, context);
  };

  const first = await runtime.handleInputChunk({ data: '\u001B[<32;2;1M' });
  assert.notEqual(first.pending, undefined);
  await firstWriteStarted.promise;
  const stale = await runtime.handleInputChunk({ data: '\u001B[<32;3;1M' });
  const latest = await runtime.handleInputChunk({ data: '\u001B[<32;4;1M' });
  const release = runtime.handleInputChunk({ data: '\u001B[<0;4;1m' });
  releaseFirstWrite.release();

  await Promise.all([first.pending, stale.pending, latest.pending, release]);
  assert.deepEqual(runtime.state().events, [
    { kind: 'dragStart', column: 2 },
    { kind: 'drag', column: 4 },
    { kind: 'dragEnd', column: 4 }
  ]);
  await runtime.dispose();
});

test('TUI runtime routes tree row hit targets to node messages', async () => {
  const app = defineTui({
    id: 'tree-mouse-routing',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.id } }),
    view: (state) => tree({
      id: 'tree',
      selected: state.selected,
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => action.kind === 'select' ? { id: action.id } : undefined
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;2M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;2m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { selected: 'child' });
  assert.match(renderFramePlain(runtime.frame()), /Child/);
});

test('TUI runtime routes tree disclosure and body hit targets separately', async () => {
  const app = defineTui({
    id: 'tree-disclosure-routing',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => tree({
      id: 'tree',
      selected: 'root',
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => ({ kind: 'tree', action })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;3;1M' });
  const disclosureRelease = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });
  await runtime.handleInputChunk({ data: '\u001B[<0;5;1M' });
  const bodyRelease = await runtime.handleInputChunk({ data: '\u001B[<0;5;1m' });

  assert.equal(disclosureRelease.results[0]?.handled, true);
  assert.equal(bodyRelease.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'tree', action: { kind: 'toggle', id: 'root' } },
      { kind: 'tree', action: { kind: 'select', id: 'root' } }
    ]
  });
});

test('TUI runtime routes overlapping mouse events to the topmost layer', async () => {
  const app = defineTui({
    id: 'layered-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
    id: 'lower-mouse-field',
    label: 'lower',
    onPress: () => ({ clicked: 'lower' }),
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
      button({
    id: 'upper-mouse-field',
    label: 'upper',
    onPress: () => ({ clicked: 'upper' }),
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
    ], {
      id: 'mouse-layer-root'
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => [target.id, target.zIndex]), [
    ['lower-mouse-field:control', 0],
    ['upper-mouse-field:control', 20]
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: 'upper' });
});

test('TUI runtime routes same-layer overlay mouse events to the last visible child', async () => {
  const app = defineTui({
    id: 'overlay-same-layer-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
        id: 'lower-overlay-field',
        label: 'lower',
        onPress: () => ({ clicked: 'lower' })
      }),
      button({
        id: 'upper-overlay-field',
        label: 'upper',
        onPress: () => ({ clicked: 'upper' })
      })
    ], { id: 'same-layer-overlay' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => target.id), [
    'lower-overlay-field:control',
    'upper-overlay-field:control'
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: 'upper' });
});

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function handleInputChunkAndSettle(runtime, data) {
  const batch = await runtime.handleInputChunk({ data });
  return [
    ...batch.results,
    ...(batch.pending === undefined ? [] : await batch.pending)
  ];
}
