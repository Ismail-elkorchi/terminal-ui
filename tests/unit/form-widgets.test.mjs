import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  button,
  checkbox,
  field,
  form,
  numberInput,
  radioGroup,
  row,
  selectBox,
  stack,
  textInput
} from '../../dist/widgets/index.js';

const enter = { kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false };
const tab = { kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false };

test('form primitives render settings and setup-wizard shapes with scoped state', () => {
  const widget = form([
    field(textInput({
      id: 'name-input',
      value: '',
      placeholder: 'Project name',
      required: true,
      error: 'Name is required'
    }), {
      id: 'name-field',
      label: 'Name',
      description: 'Shown in reports',
      required: true,
      error: 'Name is required'
    }),
    checkbox({
      id: 'telemetry',
      label: 'Send diagnostics',
      checked: true,
      message: { kind: 'toggleTelemetry' }
    }),
    radioGroup({
      id: 'mode',
      label: 'Install mode',
      selected: 'safe',
      options: [
        { id: 'safe', label: 'Safe', value: 'safe' },
        { id: 'fast', label: 'Fast', value: 'fast', disabled: true }
      ],
      toMessage: (option) => ({ kind: 'selectMode', value: option.value })
    }),
    selectBox({
      id: 'region',
      label: 'Region',
      selected: 'eu',
      options: [
        { id: 'eu', label: 'Europe', value: 'eu' },
        { id: 'us', label: 'United States', value: 'us' }
      ],
      toMessage: (option) => ({ kind: 'selectRegion', value: option.value })
    }),
    numberInput({
      id: 'workers',
      value: 4,
      min: 1,
      max: 8
    }),
    row([
      button({ id: 'submit', label: 'Continue', message: { kind: 'submit' } }),
      button({ id: 'cancel', label: 'Cancel', message: { kind: 'cancel' } })
    ])
  ], {
    id: 'setup-form',
    title: 'Setup'
  });

  const frame = renderWidgetFrame(widget, { columns: 48, rows: 24 });
  const output = renderFramePlain(frame);

  assert.match(output, /Setup/u);
  assert.match(output, /Name \*/u);
  assert.match(output, /Shown in reports/u);
  assert.match(output, /Name is required/u);
  assert.match(output, /\[x\] Send diagnostics/u);
  assert.match(output, /\(\*\) Safe/u);
  assert.match(output, /Region: Europe/u);
  assert.match(output, /4/u);
  assert.match(output, /\[ Continue \]/u);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('form accessibility exposes labels, values, validation, required, disabled, and focus state', () => {
  const widget = form([
    field(textInput({
      id: 'email',
      value: 'user@example.test',
      required: true
    }), {
      id: 'email-field',
      label: 'Email',
      required: true
    }),
    checkbox({
      id: 'terms',
      label: 'Accept terms',
      checked: false,
      required: true,
      error: 'Required before submit',
      message: { kind: 'toggleTerms' }
    }),
    radioGroup({
      id: 'tier',
      label: 'Tier',
      selected: 'free',
      options: [
        { id: 'free', label: 'Free', value: 'free' },
        { id: 'pro', label: 'Pro', value: 'pro', disabled: true }
      ]
    })
  ], {
    id: 'account-form',
    title: 'Account'
  });

  const frame = renderWidgetFrame(widget, { columns: 40, rows: 10 }, {
    focusPath: ['account-form', 'terms']
  });
  const [emailField, terms, tier] = frame.accessibility.root.children;

  assert.equal(frame.accessibility.root.role, 'application');
  assert.equal(frame.accessibility.root.label, 'Account');
  assert.equal(emailField?.label, 'Email *');
  assert.equal(emailField?.children?.[0]?.role, 'textbox');
  assert.equal(emailField?.children?.[0]?.value, 'user@example.test');
  assert.equal(terms?.role, 'checkbox');
  assert.equal(terms?.label, 'Accept terms *');
  assert.equal(terms?.checked, false);
  assert.equal(terms?.description, 'Required. Required before submit');
  assert.equal(terms?.focused, true);
  assert.equal(tier?.children?.[1]?.disabled, true);
});

test('form controls emit submit and cancel messages while app state owns values', async () => {
  const app = defineTui({
    id: 'form-flow',
    init: () => ({ result: 'editing' }),
    update: (state, message) => ({ state: { ...state, result: message.kind }, exit: {} }),
    view: (state) => form([
      textInput({
        id: 'query',
        value: state.result,
        inputMap: {
          text: (text) => ({ kind: `typed:${text}` })
        }
      }),
      row([
        button({ id: 'submit', label: 'Submit', message: { kind: 'submit' } }),
        button({ id: 'cancel', label: 'Cancel', message: { kind: 'cancel' } })
      ])
    ], {
      id: 'flow-form',
      title: 'Flow'
    })
  });

  const submitRuntime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 6 } }) });
  await submitRuntime.start();
  await submitRuntime.handleInput(tab);
  const submit = await submitRuntime.handleInput(enter);

  const cancelRuntime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 6 } }) });
  await cancelRuntime.start();
  await cancelRuntime.handleInput(tab);
  await cancelRuntime.handleInput(tab);
  const cancel = await cancelRuntime.handleInput(enter);

  assert.equal(submit.state.result, 'submit');
  assert.equal(cancel.state.result, 'cancel');
  assert.equal(renderFramePlain(submit.frame).includes('submit'), true);
  assert.equal(renderFramePlain(cancel.frame).includes('cancel'), true);
});
