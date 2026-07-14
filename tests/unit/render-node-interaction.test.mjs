import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';

import { defineTui } from '../../dist/tui/index.js';
import {
  createTerminalHarness } from '../../dist/testing/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  button,
  checkbox,
  checkboxGroup,
  colorSwatchPicker,
  commandInput,
  calendar,
  numberInput,
  radioGroup,
  rangeSlider,
  select,
  slider,
  textArea,
  textInput,
  toggleSwitch
} from '../../dist/components/index.js';

const message = { kind: 'activate' };
const formOptions = [
  { id: 'alpha', label: 'Alpha', value: 'alpha' },
  { id: 'beta', label: 'Beta', value: 'beta' }
];

const disabledWidgetCases = [
  {
    name: 'button',
    element: () => button({ id: 'disabled-button', label: 'Submit', onPress: message, disabled: true })
  },
  {
    name: 'checkbox',
    element: () => checkbox({ id: 'disabled-checkbox', label: 'Accept', checked: false, onChange: () => message, disabled: true })
  },
  {
    name: 'toggleSwitch',
    element: () => toggleSwitch({ id: 'disabled-switch', label: 'Live', checked: true, onChange: () => message, disabled: true })
  },
  {
    name: 'slider',
    element: () => slider({ id: 'disabled-slider', label: 'Volume', value: 4, onChange: () => message, disabled: true })
  },
  {
    name: 'rangeSlider',
    element: () => rangeSlider({
      id: 'disabled-range',
      label: 'Window',
      value: { start: 2, end: 8 },
      onChange: () => message,
      disabled: true
    })
  },
  {
    name: 'checkboxGroup',
    element: () => checkboxGroup({
      id: 'disabled-checkbox-list',
      label: 'Channels',
      options: formOptions,
      onAction: () => message,
      disabled: true
    })
  },
  {
    name: 'radioGroup',
    element: () => radioGroup({
      id: 'disabled-radio',
      label: 'Tier',
      options: formOptions,
      onAction: () => message,
      disabled: true
    })
  },
  {
    name: 'select',
    element: () => select({
      id: 'disabled-select',
      label: 'Tier',
      options: formOptions,
      onAction: () => message,
      disabled: true
    })
  },
  {
    name: 'colorSwatchPicker',
    element: () => colorSwatchPicker({
      id: 'disabled-colors',
      label: 'Accent',
      options: formOptions,
      onChange: () => message,
      disabled: true
    })
  },
  {
    name: 'calendar',
    element: () => calendar({
      id: 'disabled-date',
      label: 'Date',
      ...calendarFixture(),
      onAction: () => message,
      disabled: true
    })
  },
  {
    name: 'textInput',
    element: () => textInput({ id: 'disabled-text-input', value: 'locked', onSubmit: message, disabled: true })
  },
  {
    name: 'numberInput',
    element: () => numberInput({
      id: 'disabled-number-input',
      presentation: { value: '4', cursor: 1, validity: 'valid', parsedValue: 4 },
      disabled: true
    })
  },
  {
    name: 'textArea',
    element: () => textArea({ id: 'disabled-text-area', value: 'locked', disabled: true })
  }
];

for (const current of disabledWidgetCases) {
  test(`disabled ${current.name} suppresses focus pointer and exposes accessibility state`, () => {
    const frame = renderElementFrame(current.element(), { columns: 48, rows: 8 });

    assert.equal(frame.focusPath, undefined);
    assert.deepEqual(frame.hitTargets ?? [], []);
    assert.equal(frame.accessibility.root.disabled, true);
  });
}

test('disabled widget props block generated keyboard and mouse dispatch', async () => {
  const app = defineTui({
    id: 'disabled-interaction-runtime',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => button({
      id: 'disabled-action',
      label: state.active,
      onPress: { active: 'mouse' },
      keys: { enter: () => ({ active: 'key' }) },
      disabled: true
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const key = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  const mouse = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  assert.equal(key.handled, false);
  assert.equal(mouse[0]?.handled, false);
  assert.deepEqual(runtime.getState(), { active: 'idle' });
});

test('commandInput preserves disabled suggestion semantics', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'command',
      prompt: '>',
      value: 'de',
      matchQuery: 'de',
      suggestions: [
        { value: 'deploy', label: 'Deploy', description: 'Unavailable', disabled: true }
      ],
      selectedSuggestion: 0,
      display: 'expanded'
    }),
    { columns: 40, rows: 3 }
  );
  const disabledDescriptionCell = frame.cells.find((cell) => cell.text === 'U');

  assert.match(renderFramePlain(frame), /Deploy/u);
  assert.equal(disabledDescriptionCell?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.accessibility.root.children?.[0]?.disabled, true);
});
