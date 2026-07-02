import assert from 'node:assert/strict';
import test from 'node:test';

import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  createTuiRuntime,
  defineTui,
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import {
  button,
  checkbox,
  checkboxList,
  colorPicker,
  commandBar,
  datePicker,
  numberInput,
  radioGroup,
  rangeSlider,
  selectBox,
  slider,
  textArea,
  textInput,
  toggleSwitch
} from '../../dist/widgets/index.js';

const message = { kind: 'activate' };
const formOptions = [
  { id: 'alpha', label: 'Alpha', value: 'alpha' },
  { id: 'beta', label: 'Beta', value: 'beta' }
];

const disabledWidgetCases = [
  {
    name: 'button',
    widget: () => button({ id: 'disabled-button', label: 'Submit', message, disabled: true })
  },
  {
    name: 'checkbox',
    widget: () => checkbox({ id: 'disabled-checkbox', label: 'Accept', checked: false, message, disabled: true })
  },
  {
    name: 'toggleSwitch',
    widget: () => toggleSwitch({ id: 'disabled-switch', label: 'Live', checked: true, message, disabled: true })
  },
  {
    name: 'slider',
    widget: () => slider({ id: 'disabled-slider', label: 'Volume', value: 4, toMessage: () => message, disabled: true })
  },
  {
    name: 'rangeSlider',
    widget: () => rangeSlider({
      id: 'disabled-range',
      label: 'Window',
      start: 2,
      end: 8,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'checkboxList',
    widget: () => checkboxList({
      id: 'disabled-checkbox-list',
      label: 'Channels',
      options: formOptions,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'radioGroup',
    widget: () => radioGroup({
      id: 'disabled-radio',
      label: 'Tier',
      options: formOptions,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'selectBox',
    widget: () => selectBox({
      id: 'disabled-select',
      label: 'Tier',
      options: formOptions,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'colorPicker',
    widget: () => colorPicker({
      id: 'disabled-colors',
      label: 'Accent',
      options: formOptions,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'datePicker',
    widget: () => datePicker({
      id: 'disabled-date',
      label: 'Date',
      days: formOptions,
      toMessage: () => message,
      disabled: true
    })
  },
  {
    name: 'textInput',
    widget: () => textInput({ id: 'disabled-text-input', value: 'locked', message, disabled: true })
  },
  {
    name: 'numberInput',
    widget: () => numberInput({ id: 'disabled-number-input', value: 4, disabled: true })
  },
  {
    name: 'textArea',
    widget: () => textArea({ id: 'disabled-text-area', value: 'locked', disabled: true })
  }
];

for (const current of disabledWidgetCases) {
  test(`disabled ${current.name} suppresses focus pointer and exposes accessibility state`, () => {
    const frame = renderWidgetFrame(current.widget(), { columns: 48, rows: 8 });

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
      message: { active: 'mouse' },
      keyMap: { enter: { active: 'key' } },
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

test('commandBar preserves disabled suggestion semantics', () => {
  const frame = renderWidgetFrame(
    commandBar({
      id: 'command',
      prompt: '>',
      value: 'de',
      matchQuery: 'de',
      suggestions: [
        { value: 'deploy', label: 'Deploy', description: 'Unavailable', disabled: true }
      ],
      selectedSuggestion: 0
    }),
    { columns: 40, rows: 3 }
  );
  const disabledDescriptionCell = frame.cells.find((cell) => cell.text === 'U');

  assert.match(renderFramePlain(frame), /Deploy/u);
  assert.equal(disabledDescriptionCell?.style?.fg?.token, 'text.muted');
  assert.equal(frame.accessibility.root.children?.[0]?.disabled, true);
});
