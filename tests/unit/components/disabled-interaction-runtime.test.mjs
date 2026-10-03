import { createSuggestionFixture } from '../../support/collection-fixtures.mjs';
import { createOptionsFixture } from '../../support/collection-fixtures.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../../support/calendar.mjs';


import { ignoreMessage } from '../../../dist/component/index.js';
import { defineTui } from '../../../dist/tui/index.js';
import {
  createTerminalHarness } from '../../../dist/testing/index.js';
import { createTuiRuntime } from '../../../dist/tui/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../../dist/renderer/index.js';
import {
  barChart,
  button,
  checkbox,
  checkboxGroup,
  colorSwatchPicker,
  commandInput,
  contextMenu,
  calendar,
  numberInput,
  radioGroup,
  rangeSlider,
  combobox,
  link,
  menu,
  slider,
  textArea,
  textInput,
  switchControl
} from '../../../dist/components/index.js';
import { createTextDocument, textCaretAt } from '../../../dist/text/index.js';

const formOptions = [
  { id: 'alpha', label: 'Alpha', value: 'alpha' },
  { id: 'beta', label: 'Beta', value: 'beta' }
];

const disabledElementCases = [
  {
    name: 'button',
    element: () => button({ id: 'disabled-button', label: 'Submit', disabled: true })
  },
  {
    name: 'checkbox',
    element: () => checkbox({ id: 'disabled-checkbox', label: 'Accept', checked: false, disabled: true })
  },
  {
    name: 'switchControl',
    element: () => switchControl({ id: 'disabled-switch', label: 'Live', checked: true, disabled: true })
  },
  {
    name: 'slider',
    element: () => slider({ meta: { accessibleName: "Slider" }, id: 'disabled-slider', label: 'Volume', value: 4, disabled: true })
  },
  {
    name: 'rangeSlider',
    element: () => rangeSlider({ meta: { accessibleName: "Range" },
      id: 'disabled-range',
      label: 'Window',
      state: { value: { start: 2, end: 8 }, activeHandle: 'start' },
      disabled: true
    })
  },
  {
    name: 'checkboxGroup',
    element: () => checkboxGroup({ meta: { accessibleName: "Choices" },
      id: 'disabled-checkbox-list',
      label: 'Channels',
      options: formOptions,
      state: { selection: { mode: 'multiple', selectedIds: [] } },
      disabled: true
    })
  },
  {
    name: 'radioGroup',
    element: () => radioGroup({ meta: { accessibleName: "Choices" },
      id: 'disabled-radio',
      label: 'Tier',
      options: formOptions,
      state: { selection: { mode: 'single' } },
      disabled: true
    })
  },
  {
    name: 'combobox',
    element: () => combobox({
      id: 'disabled-combobox',
      label: 'Tier',
      ...createOptionsFixture(formOptions),
      state: { kind: 'select', open: false, interaction: { selection: { mode: 'single' } } },
      disabled: true
    })
  },
  {
    name: 'colorSwatchPicker',
    element: () => colorSwatchPicker({ meta: { accessibleName: "Colors" },
      id: 'disabled-colors',
      label: 'Accent',
      options: formOptions,
      state: { selection: { mode: 'single' } },
      disabled: true
    })
  },
  {
    name: 'calendar',
    element: () => calendar({ meta: { accessibleName: "Calendar" },
      id: 'disabled-date',
      label: 'Date',
      view: calendarFixture(),
      disabled: true
    })
  },
  {
    name: 'textInput',
    element: () => textInput({ meta: { accessibleName: "Text input" }, id: 'disabled-text-input', state: { text: 'locked', cursor: 0 }, disabled: true })
  },
  {
    name: 'numberInput',
    element: () => numberInput({ meta: { accessibleName: "Number input" },
      id: 'disabled-number-input',
      view: { value: '4', cursor: 1, validity: 'valid', parsedValue: 4 },
      disabled: true
    })
  },
  {
    name: 'textArea',
    element: () => textArea({ meta: { accessibleName: "Text area" }, id: 'disabled-text-area', state: { document: createTextDocument('locked'), caret: textCaretAt(0) }, disabled: true })
  },
  {
    name: 'open contextMenu',
    element: () => contextMenu({ meta: { accessibleName: "Context menu" },
      id: 'disabled-context-menu',
      view: {
        kind: 'open',
        anchor: { kind: 'cursor', row: 0, column: 0 },
        menu: {
          activePath: ['run'],
          items: [{ id: 'run', kind: 'action', label: 'Run' }]
        }
      },
      disabled: true
    })
  }
];

for (const current of disabledElementCases) {
  test(`disabled ${current.name} suppresses focus pointer and exposes accessibility state`, () => {
    const frame = renderElementFrame(current.element(), { columns: 48, rows: 8 });

    assert.equal(frame.focusPath, undefined);
    assert.deepEqual(frame.hitTargets ?? [], []);
    assert.equal(frame.accessibility.root.disabled, true);
  });
}

test('disabled components expose no keyboard or mouse dispatch', async () => {
  const app = defineTui({
    id: 'disabled-interaction-runtime',
    init: () => ({ state: ({ active: 'idle' }) }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => button({
      id: 'disabled-action',
      label: state.active,
      disabled: true
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { mouseReporting: 'click' }
  });

  await runtime.start();
  const key = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const mouse = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  assert.equal(key.handled, false);
  assert.equal(mouse.results[0]?.handled, false);
  assert.deepEqual(runtime.state(), { active: 'idle' });
});

test('boolean disabled and inert controls suppress input and restore retained handlers', async () => {
  const cases = [
    {
      name: 'button',
      view: (unavailable) => button({
        id: 'control', label: 'Run', disabled: unavailable,
        onPress: () => ({ kind: 'activate' })
      })
    },
    {
      name: 'link',
      view: (unavailable) => link({
        id: 'control', label: 'Run', href: 'https://example.test', inert: unavailable,
        onActivate: () => ({ kind: 'activate' })
      })
    }
  ];
  const enter = {
    kind: 'key', key: 'enter', eventType: 'press', location: 'standard',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false }
  };
  for (const candidate of cases) {
    const app = defineTui({
      id: `availability-${candidate.name}`,
      init: () => ({ state: { unavailable: true, activations: 0 } }),
      update: (state, message) => ({ state: message.kind === 'setAvailability'
        ? { ...state, unavailable: message.unavailable }
        : { ...state, activations: state.activations + 1 } }),
      view: (state) => candidate.view(state.unavailable)
    });
    const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
    const runtime = createTuiRuntime({ app, host: harness.host, input: { mouseReporting: 'click' } });
    await runtime.start();

    for (const [unavailable, expected] of [[true, 0], [false, 2], [true, 2], [false, 4]]) {
      await runtime.dispatch({ kind: 'setAvailability', unavailable });
      const before = runtime.state().activations;
      const key = await runtime.handleInput(enter);
      await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
      const pointer = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });
      assert.equal(runtime.state().activations, expected, `${candidate.name} availability ${String(unavailable)}`);
      assert.equal(runtime.state().activations - before, unavailable ? 0 : 2);
      assert.equal(key.handled, !unavailable);
      assert.equal(pointer.results[0]?.handled, !unavailable);
    }
  }
});

test('menus, charts, and text entry follow boolean availability at render time', () => {
  const cases = [
    {
      name: 'menu',
      element: (unavailable) => menu({
        id: 'menu', meta: { accessibleName: 'Actions' },
        view: { activePath: ['run'], items: [{ id: 'run', kind: 'action', label: 'Run' }] },
        disabled: unavailable,
        onTransition: (transition) => ({ kind: 'menu', transition })
      })
    },
    {
      name: 'barChart',
      element: (unavailable) => barChart({
        id: 'chart', label: 'Chart', items: [{ id: 'run', label: 'Run', value: 1 }],
        state: { activeId: 'run', selection: { mode: 'single' } },
        inert: unavailable,
        onTransition: (transition) => ({ kind: 'chart', transition })
      })
    },
    {
      name: 'textInput',
      element: (unavailable) => textInput({
        id: 'input', meta: { accessibleName: 'Input' },
        state: { text: 'run', cursor: 0 }, disabled: unavailable,
        onTransition: (transition) => ({ kind: 'input', transition })
      })
    }
  ];
  for (const candidate of cases) {
    for (const unavailable of [true, false, true, false]) {
      const frame = renderElementFrame(candidate.element(unavailable), { columns: 24, rows: 3 });
      assert.equal(frame.focusPath === undefined, unavailable, candidate.name);
      assert.equal((frame.hitTargets?.length ?? 0) === 0, unavailable, candidate.name);
    }
  }
});

test('unavailable controls validate retained interaction handlers', () => {
  assert.throws(
    () => button({
      id: 'invalid-disabled-button',
      label: 'Disabled',
      disabled: true,
      onPress: 'unreachable'
    }),
    /onPress must be a function/u,
  );
  assert.throws(
    () => textInput({ meta: { accessibleName: "Text input" },
      id: 'invalid-disabled-input',
      state: { text: '', cursor: 0 },
      disabled: true,
      onTransition: 'unreachable'
    }),
    /onTransition must be a function/u,
  );
  assert.throws(
    () => combobox({
      id: 'invalid-disabled-combobox',
      label: 'Choice',
      ...createOptionsFixture(formOptions),
      state: { kind: 'select', open: false, interaction: { selection: { mode: 'single' } } },
      disabled: true,
      onTransition: 'unreachable'
    }),
    /onTransition must be a function/u,
  );
  assert.throws(
    () => textArea({ meta: { accessibleName: "Text area" },
      id: 'invalid-disabled-editor',
      state: { document: createTextDocument('locked'), caret: textCaretAt(0) },
      disabled: true,
      onTransition: 'unreachable'
    }),
    /onTransition must be a function/u,
  );
  assert.throws(
    () => link({
      id: 'invalid-inert-link',
      label: 'Documentation',
      href: 'https://example.test',
      inert: true,
      onActivate: 'unreachable'
    }),
    /onActivate must be a function/u,
  );
  assert.throws(
    () => textInput({ id: 'invalid-retained-submit', state: { text: '', cursor: 0 },
      disabled: true, onSubmit: 'invalid' }),
    /onSubmit must be a function/u,
  );
  assert.throws(
    () => menu({ id: 'invalid-retained-activate', view: { activePath: [], items: [] },
      inert: true, onActivate: 'invalid' }),
    /onActivate must be a function/u,
  );
});

test('commandInput preserves disabled suggestion semantics', () => {
  const frame = renderElementFrame(
    commandInput({ meta: { accessibleName: "Command input" },
      id: 'command',
      prompt: '>',
      view: { input: { text: 'de', cursor: 0 }, open: true, ...createSuggestionFixture([
        { id: 'deploy', completion: { range: { startOffset: 0, endOffsetExclusive: 2 }, text: 'deploy' }, label: 'Deploy', description: 'Unavailable', disabled: true }
      ]) },
      query: { text: 'de', mode: 'contains' },
      display: 'expanded',
      onTransition: () => ignoreMessage()
    }),
    { columns: 40, rows: 3 }
  );
  const disabledDescriptionCell = frame.cells.find((cell) => cell.text === 'U');

  assert.match(renderFramePlain(frame), /Deploy/u);
  assert.equal(disabledDescriptionCell?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.disabled, true);
});
