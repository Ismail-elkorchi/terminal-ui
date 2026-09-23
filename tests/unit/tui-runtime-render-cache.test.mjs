import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createScrollState } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  componentElement,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import { button, tabs, text, textArea, textInput } from '../../dist/components/index.js';
import { row } from '../../dist/layout/index.js';
import { createTextDocument, textCaretAt } from '../../dist/text/index.js';
import { overlay } from '../../dist/layout/index.js';
import { renderElementInternal, rerenderElementInternal } from '../../dist/renderer/internal/render-element.js';
import { collectLayoutFocusTargets } from '../../dist/renderer/internal/focus.js';

test('initial focus is resolved before the first paint and snapshot', async () => {
  const stages = [];
  const app = defineTui({
    id: 'initial-focus-single-paint',
    init: () => ({ state: 0 }),
    update: (state) => ({ state }),
    view: () => row([
      button({ id: 'first', label: 'First', onPress: () => 1 }),
      button({ id: 'second', label: 'Second', onPress: () => 2 }),
    ]),
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } }),
    initialFocus: { kind: 'element', elementId: 'second' },
    instrumentation: {
      now: () => 1,
      record: (sample) => { stages.push(sample.stage); },
    },
  });
  try {
    const frame = await runtime.start();
    assert.ok(frame.focusPath?.includes('second'));
    assert.equal(stages.filter((stage) => stage === 'snapshot').length, 1);
    assert.equal(stages.filter((stage) => stage === 'regions').length, 1);
  } finally {
    await runtime.dispose();
  }
});

test('focus repaint retains unaffected regions and matches a fresh render', () => {
  const element = overlay([
    textInput({ id: 'first', meta: { accessibleName: 'First', layer: { zIndex: 2 } },
      state: { text: 'first', cursor: 0 }, onTransition: () => ({ kind: 'edit' }) }),
    textInput({ id: 'second', meta: { accessibleName: 'Second', layer: { zIndex: 2 } },
      state: { text: 'second', cursor: 0 }, onTransition: () => ({ kind: 'edit' }) }),
    text({ id: 'static', content: 'static', meta: { layer: { zIndex: 3 } } })
  ], { id: 'layers' });
  const size = { columns: 20, rows: 2 };
  const initial = renderElementInternal(element, size);
  const targets = collectLayoutFocusTargets(initial.layout);
  const other = targets.find((target) => target.path.includes('first'))?.path;
  assert.ok(other);
  const reused = rerenderElementInternal(initial, { focusPath: other });
  const fresh = renderElementInternal(element, size, { focusPath: other });
  assert.deepEqual(reused.frame, fresh.frame);
  const staticRegion = initial.regions.find((region) => region.zIndex === 3);
  assert.ok(staticRegion);
  assert.strictEqual(reused.regions.find((region) => region.id === staticRegion.id), staticRegion);
});

test('explicit redraw replaces view callbacks even when layout bounds are unchanged', async () => {
  let version = 1;
  let viewCalls = 0;
  const app = defineTui({
    id: 'redraw-view-refresh',
    init: () => ({ state: { selected: 0 } }),
    update: (_state, message) => ({ state: { selected: message.selected } }),
    view: () => {
      viewCalls += 1;
      const selected = version;
      return button({ id: 'refresh-button', label: `Pick ${selected}`,
        onPress: () => ({ selected }) });
    },
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 16, rows: 2 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  await runtime.start();
  version = 2;
  const refreshed = await runtime.redraw();
  assert.equal(viewCalls, 2);
  assert.match(refreshed.cells.map((cell) => cell.text).join(''), /Pick 2/u);
  const target = refreshed.hitTargets?.find((item) => item.id.startsWith('refresh-button'));
  assert.ok(target);
  await runtime.handleInput({
    kind: 'mouse', action: 'press', button: 'left', row: target.bounds.row,
    column: target.bounds.column, sequence: '', encoding: 'sgr', rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
  await runtime.handleInput({
    kind: 'mouse', action: 'release', button: 'left', row: target.bounds.row,
    column: target.bounds.column, sequence: '', encoding: 'sgr', rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
  assert.equal(runtime.state().selected, 2);
  await runtime.dispose();
});

test('TUI tabs expose clickable tab hit targets', async () => {
  const app = defineTui({
    id: 'tabs-click-tui',
    init: () => ({ state: ({ selected: 'left' }) }),
    update: (_state, message) => ({ state: { selected: message.selected } }),
    view: (state) => tabs({ meta: { accessibleName: "Tabs" },
      id: 'click-tabs',
      state: { activeId: state.selected, selectedId: state.selected },
      tabs: [
        { id: 'left', label: 'Left', panel: text({ content: 'left panel' }) },
        { id: 'right', label: 'Right', panel: text({ content: 'right panel' }) }
      ],
      onTransition: (action) => action.kind === 'select'
        ? { selected: action.id }
        : { selected: state.selected }
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 32, rows: 4 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'click-tabs:tab:right');
  assert.notEqual(target, undefined);

  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.state()?.selected, 'right');
});

test('TUI pointer presses focus the declared target before application actions', async () => {
  const app = defineTui({
    id: 'pointer-focus-tui',
    init: () => ({ state: ({ pointerActions: 0 }) }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointerActions: state.pointerActions + 1 } }
      : { state },
    view: (state) => row([
      textInput({ meta: { accessibleName: "Text input" },
        id: 'first-field',
        state: { text: `first ${String(state.pointerActions)}`, cursor: 0 },
        onTransition: () => ({ kind: 'pointer' })
      }),
      textInput({ meta: { accessibleName: "Text input" },
        id: 'second-field',
        state: { text: 'second', cursor: 0 },
        onTransition: () => ({ kind: 'pointer' })
      })
    ], { id: 'pointer-focus-fields', sizes: [{ kind: 'fill' }, { kind: 'fill' }] })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 30, rows: 2 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  const first = await runtime.start();
  const secondTarget = first.hitTargets?.find((target) => target.focus?.kind === 'focus'
    && target.focus.path.includes('second-field')
    && target.accepts?.includes('pointerDown') === true);

  assert.deepEqual(first.focusPath, ['pointer-focus-fields', 'first-field']);
  assert.notEqual(secondTarget, undefined);
  assert.deepEqual(secondTarget.focus, { kind: 'focus', path: ['pointer-focus-fields', 'second-field'] });

  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: secondTarget.bounds.row,
    column: secondTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state()?.pointerActions, 1);
  assert.deepEqual(result.frame.focusPath, ['pointer-focus-fields', 'second-field']);
});

test('TUI wheel input preserves the current focus path', async () => {
  const app = defineTui({
    id: 'wheel-preserves-focus-tui',
    init: () => ({ state: ({ scrolls: 0 }) }),
    update: (state) => ({ state: { scrolls: state.scrolls + 1 } }),
    view: () => textArea({ meta: { accessibleName: "Text area" },
      id: 'wheel-field',
      state: { document: createTextDocument('one\ntwo\nthree\nfour'), caret: textCaretAt(0), scroll: createScrollState({ contentRows: 4, viewportRows: 2 }) },
      onTransition: () => ({ kind: 'scroll' })
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.accepts?.includes('scroll') === true);

  assert.notEqual(target, undefined);
  await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: target.bounds.row,
    column: target.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.deepEqual(runtime.frame()?.focusPath, frame.focusPath);
});

test('TUI runtime routes mouse input through the committed render cache', async () => {
  let viewCalls = 0;
  const app = defineTui({
    id: 'cached-routing-tui',
    init: () => ({ state: ({ count: 0 }) }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => {
      viewCalls += 1;
      return button({ id: 'cached-button', label: `Count ${state.count}`, onPress: () => ({ kind: 'click' }) });
    }
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id.startsWith('cached-button'));

  assert.equal(viewCalls, 1);
  assert.notEqual(target, undefined);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  assert.equal(runtime.state()?.count, 0);
  assert.equal(viewCalls, 1);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.state()?.count, 1);
  assert.equal(viewCalls, 2);
});

test('TUI runtime uses committed hit targets without recomputing renderer hit targets', async () => {
  let hitTargetCalls = 0;
  const renderer = {
    ...leafComponentDefinition,
    accessibleRole: 'button',
    render({ bounds, target }) {
      target.write(bounds.row, bounds.column, [{ text: 'cached hit' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'cached hit' };
    },
    hitTargets({ bounds }) {
      hitTargetCalls += 1;
      return [{ id: 'cached-region-hit:press', bounds, message: () => ({ clicked: true }), cursor: 'pointer' }];
    }
  };
  const app = defineTui({
    id: 'committed-hit-target-routing-tui',
    init: () => ({ state: ({ clicked: false }) }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => componentElement({
      id: 'cached-region-hit',
      definition: renderer
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'cached-region-hit:press');

  assert.equal(hitTargetCalls, 1);
  assert.notEqual(target, undefined);
  assert.equal('message' in target, false);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.deepEqual(runtime.state(), { clicked: true });
  assert.equal(hitTargetCalls, 3);
});
