import assert from 'node:assert/strict';
import test from 'node:test';

import { defineTui } from '../../dist/tui/index.js';
import {
  decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import {
  button,
  checkbox,
  field,
  form,
  label,
  numberInput,
  passwordInput,
  radioGroup,
  combobox,
  textInput
} from '../../dist/components/index.js';
import { row } from '../../dist/layout/index.js';
import {
  autocompleteComboboxView,
  autocompleteComboboxReducer,
  commitAutocompleteCombobox,
  commitCombobox,
  comboboxReducer,
  createAutocompleteComboboxState,
} from '../../dist/behavior/index.js';
import { createCollectionInteractionIndex } from '../../dist/interaction/index.js';

const enter = { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };
const tab = { kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };
const pageDown = { kind: 'key', key: 'pageDown', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' };

test('text controls reject every malformed provided handler', () => {
  for (const control of [textInput, passwordInput]) {
    assert.throws(() => control({
      id: 'malformed-handler',
      state: { value: '', cursor: 0 },
      onTransition: 'not-a-function'
    }), /onTransition must be a function/u);
  }
});

test('form components render settings and setup-wizard shapes with scoped state', () => {
  const element = form({ slots: { content: [
    field({
      control: textInput({ meta: { accessibleName: "Text input" },
      id: 'name-input',
      state: { value: '', cursor: 0 },
      onTransition: (action) => action,
      placeholder: 'Project name',
      required: true,
      error: 'Name is required'
      }),
      id: 'name-field',
      label: 'Name',
      description: 'Shown in reports'
    }),
    checkbox({
      id: 'telemetry',
      label: 'Send diagnostics',
      checked: true,
      onTransition: () => ({ kind: 'toggleTelemetry' })
    }),
    radioGroup({ meta: { accessibleName: "Choices" },
      id: 'mode',
      label: 'Install mode',
      state: {
        activeId: 'safe',
        selection: { mode: 'single', selectedId: 'safe' }
      },
      options: [
        { id: 'safe', label: 'Safe', value: 'safe' },
        { id: 'fast', label: 'Fast', value: 'fast', disabled: true }
      ],
      onTransition: (action) => ({ kind: 'mode', action })
    }),
    combobox({
      id: 'region',
      label: 'Region',
      state: { kind: 'select', open: false, interaction: { selection: { mode: 'single', selectedId: 'eu' } } },
      options: [
        { id: 'eu', label: 'Europe', value: 'eu' },
        { id: 'us', label: 'United States', value: 'us' }
      ],
      onTransition: (action) => ({ kind: 'region', action })
    }),
    numberInput({ meta: { accessibleName: "Number input" },
      id: 'workers',
      view: { value: '4', cursor: 1, validity: 'valid', parsedValue: 4, min: 1, max: 8 },
      onTransition: (action) => action
    }),
    row([
      button({ id: 'submit', label: 'Continue', onPress: () => ({ kind: 'submit' }) }),
      button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' }) })
    ])
  ] },
    id: 'setup-form',
    title: 'Setup'
  });

  const frame = renderElementFrame(element, { columns: 48, rows: 24 });
  const output = renderFramePlain(frame);

  assert.match(output, /Setup/u);
  assert.match(output, /Name/u);
  assert.match(output, /Shown in reports/u);
  assert.match(output, /Name is required/u);
  assert.match(output, /☑ Send diagnostics/u);
  assert.match(output, /◉ Safe/u);
  assert.match(output, /Region: Europe/u);
  assert.match(output, /4/u);
  assert.match(output, /Continue\s+Cancel/u);
  assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
});

test('open combobox renders a bounded popup with painted option targets only', () => {
  const frame = renderElementFrame(combobox({
    id: 'region',
    label: 'Region',
    state: {
      kind: 'select',
      open: true,
      interaction: {
        activeId: 'us',
        selection: { mode: 'single', selectedId: 'eu' }
      }
    },
    options: [
      { id: 'eu', label: 'Europe', value: 'eu' },
      { id: 'disabled', label: 'Unavailable', value: 'disabled', disabled: true },
      { id: 'us', label: 'United States', value: 'us' }
    ],
    onTransition: (action) => ({ kind: 'region', action })
  }), { columns: 24, rows: 8 });
  const output = renderFramePlain(frame);
  const targetIds = frame.hitTargets?.map((target) => target.id) ?? [];

  assert.match(output, /Region: Europe/u);
  assert.match(output, /United States/u);
  assert.deepEqual(targetIds, [
    'region:trigger',
    'region:popup:outside:top',
    'region:popup:outside:right',
    'region:popup:list:option:eu',
    'region:popup:list:option:us'
  ]);
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.expanded, true);
  assert.equal(frame.accessibility.root.value, 'Europe');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'listbox');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[1]?.disabled, true);
  assert.equal(frame.accessibility.root.activeDescendant, 'region:popup:item:us');
});

test('closed combobox renders only its trigger and hides popup accessibility children', () => {
  const frame = renderElementFrame(combobox({
    id: 'region',
    label: 'Region',
    state: { kind: 'select', open: false, interaction: { selection: { mode: 'single', selectedId: 'eu' } } },
    options: [
      { id: 'eu', label: 'Europe', value: 'eu' },
      { id: 'us', label: 'United States', value: 'us' }
    ],
    onTransition: (action) => ({ kind: 'region', action })
  }), { columns: 24, rows: 4 });

  assert.doesNotMatch(renderFramePlain(frame), /United States/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['region:trigger']);
  assert.equal(frame.accessibility.root.expanded, false);
  assert.deepEqual(frame.accessibility.root.children, []);
});

test('autocomplete combobox shares editable popup state without changing select-only behavior', () => {
  const options = [
    { id: 'alpha', label: 'Alpha', value: 'alpha' },
    { id: 'beta', label: 'Beta', value: 'beta' },
  ];
  const indexForText = (text) => createCollectionInteractionIndex(
    options
      .filter((option) => option.label.toLowerCase().includes(text.toLowerCase()))
      .map((option) => option.id),
  );
  const behavior = {
    indexForText,
    completionForId: (id, input) => ({
      range: { startOffset: 0, endOffsetExclusive: input.text.length },
      text: options.find((option) => option.id === id)?.label ?? '',
    }),
  };
  const initial = createAutocompleteComboboxState(
    { value: '', open: true },
    indexForText(''),
  );
  const typed = autocompleteComboboxReducer(initial, { kind: 'setText', value: 'be' }, behavior);
  const view = autocompleteComboboxView(typed);
  const frame = renderElementFrame(combobox({
    id: 'language',
    label: 'Language',
    options: [options[1]],
    view,
    onTransition: () => ({ kind: 'transition' }),
    onCommit: () => ({ kind: 'commit' }),
  }), { columns: 24, rows: 6 });
  const committed = commitAutocompleteCombobox(
    typed,
    { kind: 'commit', id: 'beta' },
    behavior,
  );

  assert.match(renderFramePlain(frame), /Language: be/u);
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.value, 'be');
  assert.equal(view.activeId, 'beta');
  assert.equal(autocompleteComboboxView(committed).input.text, 'Beta');
  assert.deepEqual(committed.selection, { mode: 'single', selectedId: 'beta' });
  assert.equal(committed.editor.open, false);
});

test('autocomplete combobox exposes shared word-selection and context-menu semantics', () => {
  const regions = renderElementRegions(combobox({
    id: 'autocomplete-pointer-semantics',
    label: 'Language',
    options: [],
    view: {
      kind: 'autocomplete',
      open: false,
      input: {
        text: 'alpha bravo',
        cursor: 0,
        selection: { startOffset: 0, endOffsetExclusive: 5 },
      },
      selection: { mode: 'single' },
    },
    onTransition: (transition) => ({ transition }),
    onContextMenu: (event) => ({ context: event }),
  }), { columns: 32, rows: 2 });
  const target = regions.flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'autocomplete-pointer-semantics:trigger');
  assert.ok(target);
  const base = {
    source: 'mouse',
    row: target.bounds.row,
    column: target.bounds.column + 17,
    localRow: 1,
    localColumn: 18,
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: target.id,
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'release',
      button: 'left',
      row: target.bounds.row,
      column: target.bounds.column + 17,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false },
    },
  };

  assert.deepEqual(target.message({
    ...base,
    kind: 'click',
    clickCount: 2,
    button: 'left',
  })?.transition, {
    kind: 'pointer',
    transition: { kind: 'endSelection', anchor: 6, offset: 11 },
  });
  assert.deepEqual(target.message({ ...base, kind: 'contextMenu', button: 'right' })?.context, {
    kind: 'contextMenu',
    offset: 7,
    selection: { startOffset: 0, endOffsetExclusive: 5 },
    row: target.bounds.row,
    column: target.bounds.column + 17,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
});

test('autocomplete combobox keeps long input rendering cursor and pointer geometry aligned', () => {
  const options = {
    id: 'windowed-autocomplete',
    label: 'Q',
    options: [],
    view: {
      kind: 'autocomplete',
      open: false,
      input: { text: 'abcdefgh', cursor: 8 },
      selection: { mode: 'single' },
    },
    onTransition: (transition) => ({ transition }),
  };
  const frame = renderElementFrame(combobox(options), { columns: 10, rows: 1 }, {
    focusPath: ['windowed-autocomplete'],
  });
  const regions = renderElementRegions(combobox(options), { columns: 10, rows: 1 });
  const target = regions.flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'windowed-autocomplete:trigger');
  assert.ok(target);
  const message = target.message({
    source: 'mouse',
    kind: 'pointerDown',
    button: 'left',
    row: 1,
    column: 5,
    localRow: 1,
    localColumn: 5,
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: target.id,
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'press',
      button: 'left',
      row: 1,
      column: 5,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false },
    },
  });

  assert.match(renderFramePlain(frame), /^Q: ‹efgh/u);
  assert.deepEqual(message?.transition, {
    kind: 'pointer',
    transition: { kind: 'placeCaret', offset: 4 },
  });
});

test('controlled combobox pages and commits through its public behavior operations', async () => {
  const options = Array.from({ length: 6 }, (_value, index) => ({
    id: `option-${String(index + 1)}`,
    label: `Option ${String(index + 1)}`,
    value: index + 1,
  }));
  const enabledIds = options.map((option) => option.id);
  const behavior = { index: createCollectionInteractionIndex(enabledIds), pageSize: 3 };
  const app = defineTui({
    id: 'combobox-behavior',
    init: () => ({ state: ({
      combobox: {
        kind: 'select',
        open: true,
        interaction: { activeId: 'option-1', selection: { mode: 'single' } },
      },
    }) }),
    update: (state, message) => ({
      state: {
        combobox: message.kind === 'transition'
          ? comboboxReducer(state.combobox, message.transition, behavior)
          : commitCombobox(state.combobox, message.event, behavior),
      },
    }),
    view: (state) => combobox({
      id: 'choice',
      label: 'Choice',
      options,
      state: state.combobox,
      maxVisibleOptions: behavior.pageSize,
      onTransition: (transition) => ({ kind: 'transition', transition }),
      onCommit: (event) => ({ kind: 'commit', event }),
    }),
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 8 } }),
  });
  try {
    await runtime.start();
    await runtime.handleInput(pageDown);
    const result = await runtime.handleInput(enter);

    assert.equal(result.state.combobox.open, false);
    assert.equal(result.state.combobox.interaction.activeId, 'option-4');
    assert.deepEqual(result.state.combobox.interaction.selection, {
      mode: 'single',
      selectedId: 'option-4',
    });
  } finally {
    await runtime.dispose();
  }
});

test('form fields expose label required description and validation source anatomy', () => {
  const element = form({ meta: { accessibleName: "Form" }, slots: { content: [
    field({
      control: textInput({ meta: { accessibleName: "Text input" },
      id: 'name-input',
      state: { value: '', cursor: 0 },
      onTransition: (action) => action,
      placeholder: 'Project name',
      required: true,
      error: 'Name is required'
      }),
      id: 'name-field',
      label: 'Name',
      description: 'Shown in reports'
    }),
    checkbox({
      id: 'terms',
      label: 'Accept terms',
      checked: false,
      onTransition: ({ checked }) => checked,
      required: true,
      error: 'Required before submit'
    })
  ] },
    id: 'setup-form',
    title: 'Setup'
  });
  const frame = renderElementFrame(element, { columns: 42, rows: 8 });

  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'setup-form' && cell.text === 'S')?.source?.description, 'form.title');
  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'name-field' && cell.text === 'N')?.source?.description, 'field.label.text');
  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'name-field' && cell.text === 'S')?.source?.description, 'field.description');
  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'name-input' && cell.text === 'N' && cell.source.description === 'validation.error')?.style?.fg?.token, 'status.error');
  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'terms' && cell.text === '*')?.source?.description, 'label.required');
  assert.equal(frame.cells.find((cell) => cell.source?.elementId === 'terms' && cell.text === 'R')?.source?.description, 'validation.error');
  const nameField = frame.accessibility.root.children?.[0];
  const description = nameField?.children?.find((node) => node.id === 'name-field:description');
  const control = nameField?.children?.find((node) => node.id === 'name-input');
  assert.equal(description?.value, 'Shown in reports');
  assert.equal(control?.labelledBy, 'name-field:label');
  assert.deepEqual(control?.describedBy, ['name-field:description']);
  assert.equal(control?.errorMessage, 'name-input:error');
});

test('form accessibility exposes labels, values, validation, required, disabled, and focus state', () => {
  const element = form({ slots: { content: [
    field({
      control: textInput({ meta: { accessibleName: "Text input" },
      id: 'email',
      state: { value: 'user@example.test', cursor: 0 },
      onTransition: (action) => action,
      required: true
      }),
      id: 'email-field',
      label: 'Email'
    }),
    checkbox({
      id: 'terms',
      label: 'Accept terms',
      checked: false,
      required: true,
      error: 'Required before submit',
      onTransition: () => ({ kind: 'toggleTerms' })
    }),
    radioGroup({ meta: { accessibleName: "Choices" },
      id: 'tier',
      label: 'Tier',
      state: {
        activeId: 'free',
        selection: { mode: 'single', selectedId: 'free' }
      },
      options: [
        { id: 'free', label: 'Free', value: 'free' },
        { id: 'pro', label: 'Pro', value: 'pro', disabled: true }
      ],
      onTransition: (action) => action
    })
  ] },
    id: 'account-form',
    title: 'Account'
  });

  const frame = renderElementFrame(element, { columns: 40, rows: 10 }, {
    focusPath: ['account-form', 'terms']
  });
  const [emailField, terms, tier] = frame.accessibility.root.children;

  assert.equal(frame.accessibility.root.role, 'form');
  assert.equal(frame.accessibility.root.label, 'Account');
  assert.equal(emailField?.labelledBy, 'email-field:label');
  assert.equal(emailField?.children?.[0]?.controls, 'email');
  assert.equal(emailField?.children?.[1]?.role, 'textbox');
  assert.equal(emailField?.children?.[1]?.labelledBy, 'email-field:label');
  assert.equal(emailField?.children?.[1]?.value, 'user@example.test');
  assert.equal(emailField?.children?.[1]?.required, true);
  assert.equal(terms?.role, 'checkbox');
  assert.equal(terms?.label, 'Accept terms');
  assert.equal(terms?.checked, false);
  assert.equal(terms?.required, true);
  assert.equal(terms?.invalid, true);
  assert.equal(terms?.description, 'Required. Required before submit');
  assert.equal(terms?.focused, true);
  assert.equal(tier?.children?.[1]?.disabled, true);
});

test('control labels create a structural accessible-name relationship', () => {
  const frame = renderElementFrame(form({ meta: { accessibleName: "Form" }, slots: { content: [
    label({ id: 'email-label', forId: 'email-input', text: 'Email' }),
    textInput({ meta: { accessibleName: "Text input" },
      id: 'email-input',
      state: { value: 'user@example.test', cursor: 0 },
      onTransition: (action) => action
    })
  ] },
    id: 'labelled-form',
    title: 'Account'
  }), { columns: 32, rows: 4 });
  const [labelNode, inputNode] = frame.accessibility.root.children;

  assert.equal(labelNode?.role, 'text');
  assert.equal(labelNode?.label, 'Email');
  assert.equal(labelNode?.description, undefined);
  assert.equal(inputNode?.role, 'textbox');
  assert.equal(inputNode?.labelledBy, 'email-label');
  assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
});

test('control labels reject missing accessible targets', () => {
  assert.throws(
    () => renderElementFrame(label({
      id: 'orphan-label',
      forId: 'missing-input',
      text: 'Missing'
    }), { columns: 12, rows: 1 }),
    /targets missing accessible control "missing-input"/u
  );
});

test('form controls emit submit and cancel messages while app state owns values', async () => {
  const app = defineTui({
    id: 'form-flow',
    init: () => ({ state: ({ result: 'editing' }) }),
    update: (state, message) => ({ state: { ...state, result: message.kind }, exit: {} }),
    view: (state) => form({ meta: { accessibleName: "Form" }, slots: { content: [
      textInput({ meta: { accessibleName: "Text input" },
        id: 'query',
        state: { value: state.result, cursor: 0 },
        onTransition: (action) => ({
          kind: action.kind === 'edit' && action.operation.kind === 'insert'
            ? `typed:${action.operation.text}`
            : action.kind
        })
      }),
      row([
        button({ id: 'submit', label: 'Submit', onPress: () => ({ kind: 'submit' }) }),
        button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' }) })
      ])
    ] },
      id: 'flow-form',
      title: 'Flow'
    })
  });

  const submitRuntime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 6 } }) });
  await submitRuntime.start();
  await submitRuntime.handleInput(tab);
  const submit = await submitRuntime.handleInput(enter);

  const cancelRuntime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 6 } }) });
  await cancelRuntime.start();
  await cancelRuntime.handleInput(tab);
  await cancelRuntime.handleInput(tab);
  const cancel = await cancelRuntime.handleInput(enter);

  assert.equal(submit.state.result, 'submit');
  assert.equal(cancel.state.result, 'cancel');
  assert.equal(renderFramePlain(submit.frame).includes('submit'), true);
  assert.equal(renderFramePlain(cancel.frame).includes('cancel'), true);
});
