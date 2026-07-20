import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createScrollState } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { custom } from '../../dist/renderer/index.js';
import { button, tabs, text, textArea, textInput } from '../../dist/components/index.js';
import { row } from '../../dist/layout/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

test('TUI tabs expose clickable tab hit targets', async () => {
  const app = defineTui({
    id: 'tabs-click-tui',
    init: () => ({ selected: 'left' }),
    update: (_state, message) => ({ state: { selected: message.selected } }),
    view: (state) => tabs({
      id: 'click-tabs',
      selected: state.selected,
      tabs: [
        { id: 'left', label: 'Left', panel: text('left panel') },
        { id: 'right', label: 'Right', panel: text('right panel') }
      ],
      onAction: (action) => action.kind === 'select' ? { selected: action.id } : { selected: state.selected }
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 32, rows: 4 } });
  const runtime = createTuiRuntime({ app, host });
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
    init: () => ({ pointerActions: 0 }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointerActions: state.pointerActions + 1 } }
      : { state },
    view: (state) => row([
      textInput({
        id: 'first-field',
        presentation: { value: `first ${String(state.pointerActions)}`, cursor: 0 },
        onAction: () => ({ kind: 'pointer' })
      }),
      textInput({
        id: 'second-field',
        presentation: { value: 'second', cursor: 0 },
        onAction: () => ({ kind: 'pointer' })
      })
    ], { id: 'pointer-focus-fields', sizes: [{ kind: 'fill' }, { kind: 'fill' }] })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 30, rows: 2 } });
  const runtime = createTuiRuntime({ app, host });
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
    init: () => ({ scrolls: 0 }),
    update: (state) => ({ state: { scrolls: state.scrolls + 1 } }),
    view: () => textArea({
      id: 'wheel-field',
      presentation: { document: prepareTextDocument('one\ntwo\nthree\nfour'), caret: textCaretAt(0), scroll: createScrollState({ contentRows: 4, viewportRows: 2 }) },
      onAction: () => ({ kind: 'scroll' })
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host });
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
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => {
      viewCalls += 1;
      return button({ id: 'cached-button', label: `Count ${state.count}`, onPress: () => ({ kind: 'click' }) });
    }
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
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
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'cached hit' }]);
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
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => custom({
      id: 'cached-region-hit',
      renderer
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'cached-region-hit:press');

  assert.equal(hitTargetCalls, 1);
  assert.notEqual(target, undefined);
  assert.equal('message' in target, false);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.deepEqual(runtime.state(), { clicked: true });
  assert.equal(hitTargetCalls, 2);
});
