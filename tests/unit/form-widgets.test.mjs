import assert from 'node:assert/strict';
import test from 'node:test';

import { defineTui } from '../../dist/tui/index.js';
import {
  validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  button,
  checkbox,
  field,
  form,
  numberInput,
  radioGroup,
  select,
  textInput
} from '../../dist/components/index.js';
import { row } from '../../dist/layout/index.js';

const enter = { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };
const tab = { kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };

test('form primitives render settings and setup-wizard shapes with scoped state', () => {
  const widget = form([
    field(textInput({
      id: 'name-input',
      presentation: { value: '', cursor: 0 },
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
      onChange: () => ({ kind: 'toggleTelemetry' })
    }),
    radioGroup({
      id: 'mode',
      label: 'Install mode',
      selected: 'safe',
      options: [
        { id: 'safe', label: 'Safe', value: 'safe' },
        { id: 'fast', label: 'Fast', value: 'fast', disabled: true }
      ],
      onAction: (action) => ({ kind: 'mode', action })
    }),
    select({
      id: 'region',
      label: 'Region',
      presentation: { kind: 'closed', selected: 'eu' },
      options: [
        { id: 'eu', label: 'Europe', value: 'eu' },
        { id: 'us', label: 'United States', value: 'us' }
      ],
      onAction: (action) => ({ kind: 'region', action })
    }),
    numberInput({
      id: 'workers',
      presentation: { value: '4', cursor: 1, validity: 'valid', parsedValue: 4, min: 1, max: 8 }
    }),
    row([
      button({ id: 'submit', label: 'Continue', onPress: () => ({ kind: 'submit' }) }),
      button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' }) })
    ])
  ], {
    id: 'setup-form',
    title: 'Setup'
  });

  const frame = renderElementFrame(widget, { columns: 48, rows: 24 });
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

test('open select renders a bounded popup with painted option targets only', () => {
  const frame = renderElementFrame(select({
    id: 'region',
    label: 'Region',
    presentation: { kind: 'open', selected: 'eu', highlighted: 'us' },
    options: [
      { id: 'eu', label: 'Europe', value: 'eu' },
      { id: 'disabled', label: 'Unavailable', value: 'disabled', disabled: true },
      { id: 'us', label: 'United States', value: 'us' }
    ],
    onAction: (action) => ({ kind: 'region', action })
  }), { columns: 24, rows: 8 });
  const output = renderFramePlain(frame);
  const targetIds = frame.hitTargets?.map((target) => target.id) ?? [];

  assert.match(output, /Region: Europe/u);
  assert.match(output, /United States/u);
  assert.deepEqual(targetIds, [
    'region:outside',
    'region:popup',
    'region:trigger',
    'region:popup:list:option:eu',
    'region:popup:list:option:us'
  ]);
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.expanded, true);
  assert.equal(frame.accessibility.root.value, 'Europe');
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
  assert.equal(frame.accessibility.root.children?.[2]?.focused, true);
});

test('closed select renders only its trigger and hides popup accessibility children', () => {
  const frame = renderElementFrame(select({
    id: 'region',
    label: 'Region',
    presentation: { kind: 'closed', selected: 'eu' },
    options: [
      { id: 'eu', label: 'Europe', value: 'eu' },
      { id: 'us', label: 'United States', value: 'us' }
    ],
    onAction: (action) => ({ kind: 'region', action })
  }), { columns: 24, rows: 4 });

  assert.doesNotMatch(renderFramePlain(frame), /United States/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['region:trigger']);
  assert.equal(frame.accessibility.root.expanded, false);
  assert.deepEqual(frame.accessibility.root.children, []);
});

test('form fields expose label required description and validation source anatomy', () => {
  const widget = form([
    field(textInput({
      id: 'name-input',
      presentation: { value: '', cursor: 0 },
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
      id: 'terms',
      label: 'Accept terms',
      checked: false,
      required: true,
      error: 'Required before submit'
    })
  ], {
    id: 'setup-form',
    title: 'Setup'
  });
  const frame = renderElementFrame(widget, { columns: 42, rows: 8 });

  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'setup-form' && cell.text === 'S')?.source?.label, 'form.title');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'name-field' && cell.text === 'N')?.source?.label, 'field.label.text');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'name-field' && cell.text === '*')?.source?.label, 'field.label.required');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'name-field' && cell.text === 'S')?.source?.label, 'field.description');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'name-field' && cell.text === 'N' && cell.source.label === 'validation.error')?.style?.fg?.token, 'status.error');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'terms' && cell.text === '*')?.source?.label, 'label.required');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'terms' && cell.text === 'R')?.source?.label, 'validation.error');
});

test('form accessibility exposes labels, values, validation, required, disabled, and focus state', () => {
  const widget = form([
    field(textInput({
      id: 'email',
      presentation: { value: 'user@example.test', cursor: 0 },
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
      onChange: () => ({ kind: 'toggleTerms' })
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

  const frame = renderElementFrame(widget, { columns: 40, rows: 10 }, {
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
        presentation: { value: state.result, cursor: 0 },
        onAction: (action) => ({
          kind: action.kind === 'edit' && action.operation.kind === 'insert'
            ? `typed:${action.operation.text}`
            : action.kind
        })
      }),
      row([
        button({ id: 'submit', label: 'Submit', onPress: () => ({ kind: 'submit' }) }),
        button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' }) })
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
