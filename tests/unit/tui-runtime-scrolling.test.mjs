import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  applyScrollEvent,
  createScrollState,
  prepareTreeSource,
  prepareTreeView,
  treeReducer,
} from '../../dist/behavior/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  componentElement,
  compositeComponentDefinition,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { contextMenu, text, textArea, tree } from '../../dist/components/index.js';
import { column, overlay, viewport } from '../../dist/layout/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

const emptySourceMetrics = Object.freeze({
  reliableAdmissions: 0,
  replaceableAdmissions: 0,
  replacements: 0,
  dispatchedMessages: 0,
  dispatchedBatches: 0,
  maximumBuffered: 0,
  cadenceFlushes: 0
});

test('TUI wheel routing skips non-scroll child targets and reaches the scroll target', async () => {
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'group',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'child inside scroll target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'scroll target' };
    },
    hitTargets({ bounds }) {
      return [
        {
          id: 'scroll-target',
          bounds,
          accepts: ['scroll'],
          message: (event) => ({
            kind: 'scroll',
            targetId: event.targetId,
            localColumn: event.localColumn
          })
        },
        {
          id: 'child-button',
          bounds: { ...bounds, width: 8 },
          accepts: ['click'],
          message: () => ({ kind: 'child-click' }),
          cursor: 'pointer',
          zIndex: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'wheel-scroll-target-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => componentElement({ id: 'wheel-scroll-target', definition: renderer })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 28, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<65;3;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });

  assert.equal(wheel.results.length, 0);
  assert.equal(release.results[0]?.handled, true);
  assert.equal(release.results[1]?.handled, false);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'scroll', targetId: 'scroll-target', localColumn: 3 }
    ]
  });
});

test('TUI press routing keeps scroll-only content targets from swallowing text pointer targets', async () => {
  const app = defineTui({
    id: 'scroll-content-text-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 2, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => {
      if (message.kind === 'scroll') {
        return {
          state: {
            ...state,
            scroll: applyScrollEvent(state.scroll, message.event),
            events: [...state.events, message]
          }
        };
      }
      return { state: { ...state, events: [...state.events, message] } };
    },
    view: (state) => textArea({
      id: 'scrolling-text-pointer',
      presentation: { document: prepareTextDocument('alpha\nbeta'), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => action.kind === 'scroll'
        ? { kind: 'scroll', event: action.event }
        : { kind: 'text', action }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 16, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scrolling-text-pointer:scroll:content');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column + 4,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(runtime.state().events.length, 1);
  assert.equal(runtime.state().events[0].kind, 'text');
  assert.deepEqual(runtime.state().events[0].action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
});

test('TUI wheel routing keeps scroll content hits in their overlay region layer', async () => {
  const backgroundValue = Array.from({ length: 20 }, (_, index) => `background ${String(index + 1)}`).join('\n');
  const foregroundContent = column(
    Array.from({ length: 20 }, (_, index) => text({ content: `foreground ${String(index + 1)}`, id: `foreground-${String(index)}` })),
    { id: 'foreground-column' }
  );
  const app = defineTui({
    id: 'scroll-layer-routing-tui',
    init: () => ({
      background: createScrollState({ contentRows: 20, viewportRows: 1 }),
      foreground: createScrollState({ contentRows: 20, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        ...state,
        [message.scrollTarget]: applyScrollEvent(state[message.scrollTarget], message.event),
        events: [...state.events, `${message.scrollTarget}:${message.event.target}`]
      }
    }),
    view: (state) => overlay([
      textArea({
        id: 'background-scroll',
        presentation: { document: prepareTextDocument(backgroundValue), caret: textCaretAt(0), scroll: state.background },
        scrollbar: { visible: 'always' },
        onAction: (action) => ({ scrollTarget: 'background', event: action.event })
      }),
      viewport(foregroundContent, {
        id: 'foreground-scroll',
        offset: {
          row: state.foreground.offsetRow,
          column: state.foreground.offsetColumn
        },
        onScroll: (event) => ({ scrollTarget: 'foreground', event })
      })
    ], { id: 'scroll-layer-root' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 5 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const backgroundTrack = targetById(runtime, 'background-scroll:scrollbar:vertical:track');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: backgroundTrack.bounds.row,
    column: backgroundTrack.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.deepEqual(runtime.state().events, ['foreground:content']);
  assert.equal(runtime.state().foreground.offsetRow, 3);
  assert.equal(runtime.state().background.offsetRow, 0);
});

test('TUI pointer scrolling and scrollbar track input route to controlled text areas', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheel = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const wheelUpTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelUp = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelUp',
    deltaRows: -1,
    deltaColumns: 0,
    row: wheelUpTarget.bounds.row,
    column: wheelUpTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackTarget = targetById(runtime, 'scroll-editor:scrollbar:vertical:track');
  const trackPress = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackDrag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(wheel.handled, true);
  assert.equal(wheelUp.handled, true);
  assert.equal(wheelUp.state.scroll.offsetRow, 0);
  assert.equal(trackPress.handled, true);
  assert.equal(trackDrag.handled, true);
  assert.deepEqual(runtime.state().events, [
    'wheel:content',
    'wheel:content',
    'pointerDown:verticalScrollbarTrack',
    'dragStart:verticalScrollbarTrack'
  ]);
  assert.equal(runtime.state().scroll.offsetRow, 35);
  assert.match(renderFramePlain(runtime.frame()), /line 40/u);
});

test('TUI scrollbar thumb drag preserves the press anchor', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
      id: 'thumb-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'thumb-editor:scrollbar:vertical:thumb');
  const pressRow = thumbTarget.bounds.row + 1;
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: pressRow,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const drag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: pressRow + 4,
    column: thumbTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(drag.handled, true);
  assert.deepEqual(runtime.state().events, [
    'pointerDown:verticalScrollbarThumb',
    'dragStart:verticalScrollbarThumb'
  ]);
  assert.equal(runtime.state().scroll.offsetRow, 27);
});

test('TUI scrollbar thumb routing stays above its track inside elevated regions', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'elevated-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
    id: 'elevated-thumb-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
    scrollbar: { visible: 'always' },
    onAction: (action) => ({ event: action.event }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'elevated-thumb-editor:scrollbar:vertical:thumb');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: thumbTarget.bounds.row,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.deepEqual(runtime.state().events, ['pointerDown:verticalScrollbarThumb']);
});

test('TUI runtime batches decoded wheel bursts into one accelerated frame update', async () => {
  const value = Array.from({ length: 80 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-burst-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 80, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelDown = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
  const batch = await runtime.handleInputChunk({ data: wheelDown.repeat(3) });
  assert.notEqual(batch.pending, undefined);
  const results = await runtime.flushInput();

  assert.equal(batch.results.length, 0);
  assert.equal(results.length, 1);
  assert.equal(results.every((result) => result.handled), true);
  assert.equal(runtime.state().scroll.offsetRow, 9);
  assert.equal(harness.frames().length, 2);
  assert.match(renderFramePlain(runtime.frame()), /line 10/u);
});

test('viewport wheel bursts and thumb dragging keep scrolled composite children valid', async () => {
  const children = Array.from({ length: 40 }, (_value, index) =>
    text({ content: `composite line ${String(index + 1).padStart(2, '0')}`, id: `composite-line-${String(index)}` })
  );
  const app = defineTui({
    id: 'composite-viewport-scroll-tui',
    init: () => ({ scroll: createScrollState({ contentRows: children.length, viewportRows: 1 }) }),
    update: (state, message) => ({
      state: { scroll: applyScrollEvent(state.scroll, message.event) }
    }),
    view: (state) => viewport(componentElement({
      id: 'scrolling-composite',
      children,
      definition: {
        ...compositeComponentDefinition,
        layout({ bounds }) {
          return children.map((_child, index) => ({
            row: bounds.row + index,
            column: bounds.column,
            width: bounds.width,
            height: 1
          }));
        },
        accessibility({ id, children: accessibleChildren }) {
          return { id, role: 'group', label: 'Scrolling composite', children: accessibleChildren };
        }
      }
    }), {
      id: 'composite-viewport',
      offset: { row: state.scroll.offsetRow },
      scrollbar: { visible: 'always', axis: 'vertical' },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const content = targetById(runtime, 'composite-viewport:scroll:content');
  const wheelDown = `\u001B[<65;${String(content.bounds.column)};${String(content.bounds.row)}M`;
  await runtime.handleInputChunk({ data: wheelDown.repeat(3) });
  await runtime.flushInput();
  const offsetAfterWheel = runtime.state().scroll.offsetRow;
  const thumb = targetById(runtime, 'composite-viewport:scrollbar:vertical:thumb');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: thumb.bounds.row,
    column: thumb.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const drag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: Math.min(thumb.bounds.row + 3, 6),
    column: thumb.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'release',
    button: 'left',
    row: Math.min(thumb.bounds.row + 3, 6),
    column: thumb.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(offsetAfterWheel, 9);
  assert.equal(press.handled, true);
  assert.equal(drag.handled, true);
  assert.equal(runtime.state().scroll.offsetRow > offsetAfterWheel, true);
  assert.match(renderFramePlain(runtime.frame()), /composite line/u);
  assert.deepEqual(runtime.diagnostics(), []);
  await runtime.dispose();
});

test('TUI runtime coalesces compatible wheel packets across terminal reads', async () => {
  const value = Array.from({ length: 80 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'cross-read-wheel-batch-tui',
    init: () => ({ scroll: createScrollState({ contentRows: 80, viewportRows: 1 }) }),
    update: (state, message) => ({ state: { scroll: applyScrollEvent(state.scroll, message.event) } }),
    view: (state) => textArea({
      id: 'cross-read-editor',
      presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'cross-read-editor:scroll:content');
  const wheelDown = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
  const first = await runtime.handleInputChunk({ data: wheelDown });
  const second = await runtime.handleInputChunk({ data: wheelDown });
  const third = await runtime.handleInputChunk({ data: wheelDown });

  assert.equal(first.results.length, 0);
  assert.equal(second.results.length, 0);
  assert.equal(third.results.length, 0);
  assert.equal(third.pending, first.pending);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 3,
    wheelPackets: 3,
    dispatchedMessages: 0,
    frameCommits: 1,
    diagnostics: { retained: 0, omitted: 0 },
    effects: { active: 0, queued: 0, rejected: 0 },
    sources: emptySourceMetrics
  });

  harness.clock.advance(8);
  const results = await third.pending;

  assert.equal(results?.length, 1);
  assert.equal(results?.[0]?.handled, true);
  assert.equal(runtime.state().scroll.offsetRow, 9);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 3,
    wheelPackets: 3,
    dispatchedMessages: 1,
    frameCommits: 2,
    diagnostics: { retained: 0, omitted: 0 },
    effects: { active: 0, queued: 0, rejected: 0 },
    sources: emptySourceMetrics
  });
  assert.equal(harness.frames().length, 2);
});

test('TUI runtime flushes pending wheel input before keyboard input', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'wheel-key-barrier-tui',
    init: () => ({ scroll: createScrollState({ contentRows: 40, viewportRows: 1 }), keys: 0 }),
    update: (state, message) => message.kind === 'scroll'
      ? { state: { ...state, scroll: applyScrollEvent(state.scroll, message.event) } }
      : { state: { ...state, keys: state.keys + 1 } },
    inputBindings: [{
      id: 'count-key',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'enter' }],
      message: { kind: 'key' }
    }],
    view: (state) => textArea({
      id: 'barrier-editor',
      presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      onAction: (action) => action.kind === 'scroll' ? { kind: 'scroll', event: action.event } : undefined
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'barrier-editor:scroll:content');
  await runtime.handleInputChunk({
    data: `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`
  });
  const key = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(key.results.length, 2);
  assert.equal(key.results.every((result) => result.handled), true);
  assert.equal(runtime.state().scroll.offsetRow, 3);
  assert.equal(runtime.state().keys, 1);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 2,
    wheelPackets: 1,
    dispatchedMessages: 2,
    frameCommits: 3,
    diagnostics: { retained: 0, omitted: 0 },
    effects: { active: 0, queued: 0, rejected: 0 },
    sources: emptySourceMetrics
  });
});

test('TUI routed wheel events honor scroll-target line steps', async () => {
  const value = Array.from({ length: 40 }, (_, index) =>
    `line ${String(index + 1).padStart(2, '0')} ${'x'.repeat(60)}`
  ).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-lines-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, contentColumns: 80, viewportRows: 1, viewportColumns: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 8, columns: 5 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 22, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const right = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelRight',
    deltaRows: 0,
    deltaColumns: 1,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 67,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(right.handled, true);
  assert.equal(runtime.state().event.nextState, runtime.state().scroll);
  assert.equal(runtime.state().scroll.offsetRow, 8);
  assert.equal(runtime.state().scroll.offsetColumn, 5);
  assert.match(renderFramePlain(runtime.frame()), /09 x/u);
});

test('TUI routed horizontal text area scroll uses the editable viewport after gutters', async () => {
  const value = '01234567890123456789';
  const app = defineTui({
    id: 'text-area-horizontal-gutter-scroll-tui',
    init: () => ({
      scroll: createScrollState({}),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'horizontal-gutter-editor',
      lineNumbers: true,
      presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always', axis: 'both' },
      scrollPolicy: { wheel: { rows: 1, columns: 1 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 14, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'horizontal-gutter-editor:scroll:content');
  const editableViewportColumns = contentTarget.bounds.width;
  for (let index = 0; index < 20; index += 1) {
    await runtime.handleInput({
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'wheel',
      button: 'wheelRight',
      deltaRows: 0,
      deltaColumns: 1,
      row: contentTarget.bounds.row,
      column: contentTarget.bounds.column + 1,
      rawCode: 67,
      modifiers: { shift: false, alt: false, ctrl: false }
    });
  }

  assert.equal('scroll' in runtime.state().event, false);
  assert.equal(runtime.state().scroll.offsetColumn, value.length - editableViewportColumns);
});

test('TUI routed wheel events support page-based scroll-target policy', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-pages-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { document: prepareTextDocument(value), caret: textCaretAt(0), scroll: state.scroll },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { unit: 'page', rows: 1 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(runtime.state().scroll.offsetRow, 5);
  assert.match(renderFramePlain(runtime.frame()), /line 06/u);
});

test('TUI routed tree scroll events carry normalized rendered viewport metrics', async () => {
  const nodes = Array.from({ length: 6 }, (_value, index) => ({
    id: `node-${String(index)}`,
    label: `Node ${String(index + 1)}`,
    kind: 'leaf'
  }));
  const source = prepareTreeSource(nodes);
  const app = defineTui({
    id: 'tree-scroll-pointer-tui',
    init: () => ({
      tree: {
        expandedIds: [],
        selection: { mode: 'none' },
        scroll: createScrollState({})
      },
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        tree: treeReducer(state.tree, message.action, {
          view: prepareTreeView(source, state.tree)
        }),
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => tree({
      id: 'tree-scroll',
      view: prepareTreeView(source, state.tree),
      presentation: state.tree,
      scrollbar: { visible: 'always' },
      onTransition: (action) => ({ action })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'tree-scroll:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state().event.nextState.offsetRow, 3);
  assert.equal('scroll' in runtime.state().event, false);
  assert.equal(runtime.state().tree.scroll.offsetRow, 3);
  assert.match(renderFramePlain(runtime.frame()), /Node 4/u);
});

test('TUI routed context menu scroll events use a fixed title row and shared scroll policy', async () => {
  const items = Array.from({ length: 8 }, (_value, index) => ({
    kind: 'action',
    id: `item-${String(index + 1)}`,
    label: `Item ${String(index + 1)}`
  }));
  const app = defineTui({
    id: 'context-menu-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: items.length, viewportRows: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: message.action.kind === 'scroll' ? applyScrollEvent(state.scroll, message.action.event) : state.scroll,
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => contextMenu({
      id: 'context-scroll',
      title: 'Actions',
      presentation: {
        kind: 'open',
        anchor: { kind: 'cursor', row: 1, column: 1 },
        menu: { activePath: ['item-1'], items, scroll: state.scroll }
      },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 2 } },
      onTransition: (action) => ({
        action: action.kind === 'menu' ? action.transition : action
      })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  const contentTarget = targetById(runtime, 'context-scroll:popup:menu:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state().event.nextState.offsetRow, 2);
  assert.equal(runtime.state().scroll.offsetRow, 2);
  const frame = renderFramePlain(runtime.frame());
  assert.match(frame, /Actions/u);
  assert.match(frame, /Item 3/u);
});


function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}
