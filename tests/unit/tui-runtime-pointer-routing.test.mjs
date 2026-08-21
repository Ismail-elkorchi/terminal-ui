import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  prepareTreeSource,
  prepareTreeView,
} from '../../dist/behavior/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  componentElement,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { button, tree } from '../../dist/components/index.js';
import { overlay, row } from '../../dist/layout/index.js';

test('TUI runtime routes mouse events to elements under the pointer', async () => {
  const app = defineTui({
    id: 'mouse-routing',
    init: () => ({ state: ({ clicked: false }) }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: (state) => button({
      id: 'mouse-field',
      label: state.clicked ? 'clicked' : 'idle',
      onAction: () => ({ clicked: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'mouse-field:control',
    bounds: { row: 1, column: 1, width: 20, height: 3 },
    accepts: ['click'],
    focus: { kind: 'focus', path: ['mouse-field'] },
    cursor: 'pointer',
    zIndex: 0
  });
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /clicked/);
});

test('TUI pointer click activates once on left release and ignores right click or wheel', async () => {
  const app = defineTui({
    id: 'pointer-router-events',
    init: () => ({ state: ({ clicks: 0 }) }),
    update: (state, message) => ({ state: { clicks: state.clicks + message.clicks } }),
    view: (state) => button({
      id: 'pointer-field',
      label: `clicks ${state.clicks}`,
      onAction: () => ({ clicks: 1 })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const leftPress = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;1;1M' });
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<64;1;1M' });

  assert.equal(leftPress.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.equal(rightPress.results[0]?.handled, false);
  assert.notEqual(wheel.pending, undefined);
  const wheelResults = await runtime.flushInput();
  assert.equal(wheelResults[0]?.handled, false);
  assert.deepEqual(runtime.state(), { clicks: 1 });
});

test('runtime owns built-in hover and press presentation without application messages', async () => {
  const app = defineTui({
    id: 'runtime-pointer-interaction',
    init: () => ({ state: ({ activations: 0 }) }),
    update: (state) => ({ state: { activations: state.activations + 1 } }),
    view: () => button({
      id: 'runtime-button',
      label: 'Run',
      onAction: () => ({ kind: 'activate' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'all' } });

  await runtime.start();
  await handleInputChunkAndSettle(runtime, '\u001B[<35;2;1M');
  assert.equal(runtime.state().activations, 0);
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'R')?.source?.interactionState, 'hovered');

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  assert.equal(runtime.state().activations, 0);
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'R')?.source?.interactionState, 'pressed');

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), { activations: 1 });
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'R')?.source?.interactionState, 'hovered');

  await handleInputChunkAndSettle(runtime, '\u001B[<35;20;2M');
  assert.deepEqual(runtime.state(), { activations: 1 });
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'R')?.source?.interactionState, 'focused');
});

test('disabled controls expose neither activation nor synthetic pointer lifecycle targets', async () => {
  const app = defineTui({
    id: 'disabled-pointer-interaction',
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => button({
      id: 'disabled-button',
      label: 'Disabled',
      disabled: true
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets ?? [], []);
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), { events: [] });
});

test('TUI pointer targets receive pointerDown and pointerUp lifecycle messages', async () => {
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'pointer-lifecycle', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

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
    ...leafComponentDefinition,
    accessibleRole: 'group',
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'pointer-click-count-targets', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });
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
    ...leafComponentDefinition,
    accessibleRole: 'group',
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'hover-lifecycle', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'all' } });

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
    ...leafComponentDefinition,
    accessibleRole: 'button',
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'event-aware-pointer', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

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
    ...leafComponentDefinition,
    accessibleRole: 'button',
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'drag-pointer', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const drag = await handleInputChunkAndSettle(runtime, '\u001B[<32;10;1M');
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;10;1m' });

  assert.equal(press.results[0]?.handled, true);
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
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ model, target }) {
      target.write(0, 0, [{ text: `events ${String(model.eventCount)}` }]);
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
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: (state) => componentElement({
      id: 'coalesced-drag',
      definition: renderer,
      eventCount: state.events.length
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });
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

test('pointer capture resolves the latest target callback after a render', async () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ model, target }) {
      target.write(0, 0, [{ text: `v${String(model.version)}` }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'versioned pointer' };
    },
    hitTargets({ bounds, model }) {
      return [{
        id: 'control',
        bounds,
        accepts: ['pointerDown', 'pointerUp', 'click'],
        message: (event) => ({ kind: event.kind, version: model.version })
      }];
    }
  };
  const app = defineTui({
    id: 'latest-pointer-target',
    init: () => ({ state: ({ version: 0, events: [] }) }),
    update: (state, message) => ({
      state: {
        version: message.kind === 'pointerDown' ? state.version + 1 : state.version,
        events: [...state.events, message]
      }
    }),
    view: (state) => componentElement({
      id: 'versioned',
      definition,
      version: state.version
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 8, rows: 1 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.deepEqual(runtime.state().events, [
    { kind: 'pointerDown', version: 0 },
    { kind: 'pointerUp', version: 1 },
    { kind: 'click', version: 1 }
  ]);
});

test('pointer identity includes the owning element when local target ids collide', async () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ model, target }) {
      target.write(0, 0, [{ text: model.label }]);
    },
    accessibility({ id, model }) {
      return { id, role: 'button', label: model.label };
    },
    hitTargets({ bounds, model }) {
      return [{
        id: 'control',
        bounds,
        accepts: ['click'],
        message: () => ({ clicked: model.label })
      }];
    }
  };
  const app = defineTui({
    id: 'qualified-pointer-targets',
    init: () => ({ state: ({ clicks: [] }) }),
    update: (state, message) => ({ state: { clicks: [...state.clicks, message.clicked] } }),
    view: () => row([
      componentElement({ id: 'left', definition, label: 'L' }),
      componentElement({ id: 'right', definition, label: 'R' })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 2, rows: 1 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });

  assert.deepEqual(runtime.state(), { clicks: [] });
});

test('wheel batches retain their ingestion target across intervening renders', async () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'group',
    render({ model, target }) {
      target.write(0, 0, [{ text: model.owner }]);
    },
    accessibility({ id, model }) {
      return { id, role: 'group', label: model.owner };
    },
    hitTargets({ bounds, model }) {
      return [{
        id: 'scroll',
        bounds,
        accepts: ['scroll'],
        message: () => ({ kind: 'scroll', owner: model.owner })
      }];
    }
  };
  const app = defineTui({
    id: 'wheel-ingestion-target',
    init: () => ({ state: ({ owner: 'old', events: [] }) }),
    update: (state, message) => message.kind === 'replace'
      ? { state: { ...state, owner: 'new' } }
      : { state: { ...state, events: [...state.events, message.owner] } },
    view: (state) => componentElement({
      id: state.owner,
      definition,
      owner: state.owner
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 8, rows: 1 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<64;1;1M' });
  assert.notEqual(wheel.pending, undefined);
  await runtime.dispatch({ kind: 'replace' });
  const settled = await runtime.flushInput();

  assert.equal(settled[0]?.handled, false);
  assert.deepEqual(runtime.state(), { owner: 'new', events: [] });
});

test('terminal focus loss cancels pressed and hovered pointer state', async () => {
  const app = defineTui({
    id: 'pointer-focus-loss',
    init: () => ({ state: ({ activations: 0 }) }),
    update: (state) => ({ state: { activations: state.activations + 1 } }),
    view: () => button({
      id: 'focus-loss-button',
      label: 'Button',
      onAction: () => ({ kind: 'activate' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 12, rows: 1 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { focusReporting: true, mouseReporting: 'all' }
  });

  await runtime.start();
  await handleInputChunkAndSettle(runtime, '\u001B[<35;1;1M');
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'B')?.source?.interactionState, 'pressed');

  await runtime.handleInputChunk({ data: '\u001B[O' });
  assert.deepEqual(runtime.state(), { activations: 0 });
  assert.equal(runtime.frame().cells.find((cell) => cell.text === 'B')?.source?.interactionState, 'focused');
});

test('an abandoned second click clears the previous double-click candidate', async () => {
  const definition = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ target }) {
      target.write(0, 0, [{ text: 'click' }]);
    },
    accessibility: ({ id }) => ({ id, role: 'button', label: 'click' }),
    hitTargets: ({ bounds }) => [{
      id: 'control',
      bounds: { ...bounds, width: 1 },
      accepts: ['click'],
      message: (event) => event.clickCount
    }]
  };
  const app = defineTui({
    id: 'failed-double-click',
    init: () => ({ state: ({ counts: [] }) }),
    update: (state, count) => ({ state: { counts: [...state.counts, count] } }),
    view: () => componentElement({ id: 'click', definition })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 3, rows: 1 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });
  const pointer = (action, column) => runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button: action === 'release' ? 'none' : 'left',
    row: 1,
    column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  await runtime.start();
  await pointer('press', 1);
  await pointer('release', 1);
  await pointer('press', 1);
  await pointer('release', 2);
  await pointer('press', 1);
  await pointer('release', 1);

  assert.deepEqual(runtime.state().counts, [1, 1]);
});

test('TUI runtime routes tree row hit targets to node messages', async () => {
  const nodes = [
    { id: 'root', label: 'Root', kind: 'branch', children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
  ];
  const source = prepareTreeSource(nodes);
  const app = defineTui({
    id: 'tree-mouse-routing',
    init: () => ({ state: ({ activeId: undefined }) }),
    update: (_state, message) => ({ state: { activeId: message.id } }),
    view: (state) => {
      const presentation = {
        expandedIds: ['root'],
        ...(state.activeId === undefined ? {} : { activeId: state.activeId }),
        selection: { mode: 'none' }
      };
      return tree({ meta: { accessibleName: "Tree" },
        id: 'tree',
        presentation,
        view: prepareTreeView(source, presentation),
        onTransition: (action) => action.kind === 'setActive' ? { id: action.id } : undefined
      });
    }
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;2M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;2m' });

  assert.equal(press.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { activeId: 'child' });
  assert.match(renderFramePlain(runtime.frame()), /Child/);
});

test('TUI runtime routes tree disclosure and body hit targets separately', async () => {
  const nodes = [
    { id: 'root', label: 'Root', kind: 'branch', children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
  ];
  const presentation = {
    expandedIds: ['root'],
    activeId: 'root',
    selection: { mode: 'none' }
  };
  const source = prepareTreeSource(nodes);
  const app = defineTui({
    id: 'tree-disclosure-routing',
    init: () => ({ state: ({ events: [] }) }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => tree({ meta: { accessibleName: "Tree" },
      id: 'tree',
      presentation,
      view: prepareTreeView(source, presentation),
      onTransition: (action) => ({ kind: 'tree', action })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

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
      { kind: 'tree', action: { kind: 'setActive', id: 'root' } }
    ]
  });
});

test('TUI runtime routes overlapping mouse events to the topmost layer', async () => {
  const app = defineTui({
    id: 'layered-mouse-routing',
    init: () => ({ state: ({ clicked: 'none' }) }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
    id: 'lower-mouse-field',
    label: 'lower',
    onAction: () => ({ clicked: 'lower' }),
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
      button({
    id: 'upper-mouse-field',
    label: 'upper',
    onAction: () => ({ clicked: 'upper' }),
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
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => [target.id, target.zIndex]), [
    ['lower-mouse-field:control', 0],
    ['upper-mouse-field:control', 20]
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: 'upper' });
});

test('TUI runtime routes same-layer overlay mouse events to the last visible child', async () => {
  const app = defineTui({
    id: 'overlay-same-layer-mouse-routing',
    init: () => ({ state: ({ clicked: 'none' }) }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
        id: 'lower-overlay-field',
        label: 'lower',
        onAction: () => ({ clicked: 'lower' })
      }),
      button({
        id: 'upper-overlay-field',
        label: 'upper',
        onAction: () => ({ clicked: 'upper' })
      })
    ], { id: 'same-layer-overlay' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => target.id), [
    'lower-overlay-field:control',
    'upper-overlay-field:control'
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, true);
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
