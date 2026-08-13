import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFixture } from '../helpers/calendar.mjs';
import { prepareCommandSuggestions } from '../../dist/behavior/index.js';

import { ignoreMessage } from '../../dist/component/index.js';
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
  contextMenu,
  calendar,
  numberInput,
  radioGroup,
  rangeSlider,
  combobox,
  link,
  slider,
  textArea,
  textInput,
  switchControl
} from '../../dist/components/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

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
    element: () => slider({ id: 'disabled-slider', label: 'Volume', value: 4, disabled: true })
  },
  {
    name: 'rangeSlider',
    element: () => rangeSlider({
      id: 'disabled-range',
      label: 'Window',
      state: { value: { start: 2, end: 8 }, activeHandle: 'start' },
      disabled: true
    })
  },
  {
    name: 'checkboxGroup',
    element: () => checkboxGroup({
      id: 'disabled-checkbox-list',
      label: 'Channels',
      options: formOptions,
      presentation: { selection: { mode: 'multiple', selectedIds: [] } },
      disabled: true
    })
  },
  {
    name: 'radioGroup',
    element: () => radioGroup({
      id: 'disabled-radio',
      label: 'Tier',
      options: formOptions,
      presentation: { selection: { mode: 'single' } },
      disabled: true
    })
  },
  {
    name: 'combobox',
    element: () => combobox({
      id: 'disabled-combobox',
      label: 'Tier',
      options: formOptions,
      presentation: { open: false, interaction: { selection: { mode: 'single' } } },
      disabled: true
    })
  },
  {
    name: 'colorSwatchPicker',
    element: () => colorSwatchPicker({
      id: 'disabled-colors',
      label: 'Accent',
      options: formOptions,
      presentation: { selection: { mode: 'single' } },
      disabled: true
    })
  },
  {
    name: 'calendar',
    element: () => calendar({
      id: 'disabled-date',
      label: 'Date',
      presentation: calendarFixture(),
      disabled: true
    })
  },
  {
    name: 'textInput',
    element: () => textInput({ id: 'disabled-text-input', presentation: { value: 'locked', cursor: 0 }, disabled: true })
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
    element: () => textArea({ id: 'disabled-text-area', presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) }, disabled: true })
  },
  {
    name: 'open contextMenu',
    element: () => contextMenu({
      id: 'disabled-context-menu',
      presentation: {
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
    init: () => ({ active: 'idle' }),
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

test('unavailable controls ignore unreachable interaction options', () => {
  assert.doesNotThrow(
    () => button({
      id: 'invalid-disabled-button',
      label: 'Disabled',
      disabled: true,
      onAction: 'unreachable'
    }),
  );
  assert.doesNotThrow(
    () => textInput({
      id: 'invalid-disabled-input',
      presentation: { value: '', cursor: 0 },
      disabled: true,
      onAction: 'unreachable'
    }),
  );
  assert.doesNotThrow(
    () => combobox({
      id: 'invalid-disabled-combobox',
      label: 'Choice',
      options: formOptions,
      presentation: { open: false, interaction: { selection: { mode: 'single' } } },
      disabled: true,
      onTransition: 'unreachable'
    }),
  );
  assert.doesNotThrow(
    () => textArea({
      id: 'invalid-disabled-editor',
      presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) },
      disabled: true,
      onAction: 'unreachable'
    }),
  );
  assert.doesNotThrow(
    () => button({
      id: 'invalid-disabled-pointer',
      label: 'Disabled',
      disabled: true,
      pointerState: new Proxy({}, {
        get() { throw new Error('unreachable pointer state was read'); }
      })
    }),
  );
  assert.doesNotThrow(
    () => link({
      id: 'invalid-inert-link',
      label: 'Documentation',
      href: 'https://example.test',
      inert: true,
      onActivate: 'unreachable'
    }),
  );
});

test('pointer state reads each consumed field once and ignores unrelated fields', () => {
  const reads = new Map();
  const pointerState = new Proxy({ hoveredTargetId: 'submit:control', typo: true }, {
    get(target, field, receiver) {
      reads.set(field, (reads.get(field) ?? 0) + 1);
      return Reflect.get(target, field, receiver);
    }
  });

  button({
    id: 'submit',
    label: 'Submit',
    pointerState,
    onAction: () => ignoreMessage()
  });

  assert.equal(reads.get('hoveredTargetId'), 1);
  assert.equal(reads.get('pressedTargetId'), 1);
  assert.equal(reads.get('typo'), undefined);
});

test('commandInput preserves disabled suggestion semantics', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'command',
      prompt: '>',
      presentation: { value: 'de', cursor: 0, suggestions: prepareCommandSuggestions([
        { id: 'deploy', value: 'deploy', label: 'Deploy', description: 'Unavailable', disabled: true }
      ]) },
      matchQuery: 'de',
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
