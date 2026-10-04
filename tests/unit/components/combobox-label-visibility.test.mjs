import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeAccessibleSnapshot } from '../../../dist/accessibility/index.js';
import { combobox, label } from '../../../dist/components/forms.js';
import { column } from '../../../dist/layout/index.js';
import { measureElement, renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementRegions } from '../../../dist/renderer/internal/render-element.js';
import { createOptionsFixture } from '../../support/collection-fixtures.mjs';

function selectOptions(overrides = {}) {
  return {
    id: 'region',
    label: 'Region',
    ...createOptionsFixture([
      { id: 'eu', label: 'Europe', value: 'eu' },
      { id: 'us', label: 'United States', value: 'us' },
    ]),
    state: {
      kind: 'select',
      open: false,
      interaction: { selection: { mode: 'single', selectedId: 'eu' } },
    },
    onTransition: (transition) => ({ transition }),
    ...overrides,
  };
}

test('combobox visible labels remain the default and explicit visible policy is identical', () => {
  const defaults = combobox(selectOptions({ required: true }));
  const visible = combobox(selectOptions({ required: true, labelVisibility: 'visible' }));
  const size = { columns: 32, rows: 2 };
  const defaultFrame = renderElementFrame(defaults, size);
  const visibleFrame = renderElementFrame(visible, size);

  assert.match(renderFramePlain(defaultFrame), /^Region \*: Europe/u);
  assert.deepEqual(visibleFrame, defaultFrame);
  assert.deepEqual(measureElement(visible, size), measureElement(defaults, size));
  assert.equal(measureElement(defaults, size).preferredWidth, 18);
});

test('hidden combobox labels reclaim their full prefix width and preserve validation semantics', () => {
  const control = combobox(selectOptions({
    labelVisibility: 'hidden',
    required: true,
    error: 'Choose a region',
  }));
  const size = { columns: 8, rows: 2 };
  const frame = renderElementFrame(control, size);

  assert.match(renderFramePlain(frame), /^Europe /u);
  assert.equal(frame.cells.some(cell => cell.source?.partType === 'label'), false);
  assert.deepEqual(measureElement(control, { columns: 32, rows: 2 }), {
    minWidth: 1, minHeight: 1, preferredWidth: 8, preferredHeight: 2,
  });
  assert.equal(frame.accessibility.root.label, 'Region');
  assert.equal(frame.accessibility.root.value, 'Europe');
  assert.equal(frame.accessibility.root.required, true);
  assert.equal(frame.accessibility.root.invalid, true);
  assert.equal(frame.accessibility.root.errorMessage, 'region:error');
  assert.equal(frame.accessibility.root.children[0].label, 'Choose a region');
  assert.deepEqual(frame.hitTargets.map(target => target.id), ['region:trigger']);
  const trigger = renderElementRegions(control, size)
    .flatMap(region => region.hitTargets).find(target => target.id === 'region:trigger');
  assert.deepEqual(trigger.message(), { transition: { kind: 'toggle' } });
});

test('hidden combobox labels preserve placeholder and popup relationships', () => {
  const empty = combobox(selectOptions({
    labelVisibility: 'hidden',
    placeholder: 'Pick one',
    state: { kind: 'select', open: false, interaction: { selection: { mode: 'single' } } },
  }));
  assert.match(renderFramePlain(renderElementFrame(empty, { columns: 12, rows: 1 })), /^Pick one /u);
  assert.equal(measureElement(empty, { columns: 32, rows: 1 }).preferredWidth, 10);

  const open = combobox(selectOptions({
    labelVisibility: 'hidden',
    state: {
      kind: 'select',
      open: true,
      interaction: { activeId: 'us', selection: { mode: 'single', selectedId: 'eu' } },
    },
  }));
  const frame = renderElementFrame(open, { columns: 24, rows: 8 });
  assert.match(renderFramePlain(frame), /^Europe /u);
  assert.equal(frame.accessibility.root.label, 'Region');
  assert.equal(frame.accessibility.root.controls, 'region:popup');
  assert.equal(frame.accessibility.root.activeDescendant, 'region:popup:item:us');
  assert.equal(frame.accessibility.root.children[0].label, 'Region options');
  assert.equal(frame.hitTargets.some(target => target.id === 'region:popup:list:option:us'), true);
});

for (const kind of ['select', 'autocomplete']) {
  test(`unnamed ${kind} popups preserve explicit empty labels through repeated opening`, () => {
    for (const labelVisibility of ['visible', 'hidden']) {
      for (const open of [false, true, false, true]) {
        const frame = renderElementFrame(combobox(unnamedOptions(kind, open, labelVisibility)), {
          columns: 24, rows: 8,
        });
        const control = frame.accessibility.root;
        assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
        assert.equal(control.label, '');
        assert.equal(control.labelledBy, undefined);
        assert.equal(control.expanded, open);
        assert.equal(control.controls, open ? 'region:popup' : undefined);
        assert.equal(control.activeDescendant, open ? 'region:popup:item:us' : undefined);
        if (!open) {
          assert.deepEqual(control.children, []);
          continue;
        }
        const popup = control.children[0];
        assert.equal(popup.role, 'listbox');
        assert.equal(popup.label, '');
        assert.equal(popup.labelledBy, undefined);
        assert.equal(popup.children[0].label, 'Europe');
        assert.equal(popup.children[0].selected, true);
        assert.equal(popup.children[1].id, control.activeDescendant);
      }
    }
  });

  test(`open ${kind} popups preserve real external control-label relationships`, () => {
    const frame = renderElementFrame(column([
      label({ id: 'region-label', forId: 'region', text: 'Shipping region' }),
      combobox(unnamedOptions(kind, true, 'hidden')),
    ]), { columns: 24, rows: 8 });
    const [externalLabel, control] = frame.accessibility.root.children;
    assert.equal(decodeAccessibleSnapshot(frame.accessibility).status, 'success');
    assert.equal(externalLabel.label, 'Shipping region');
    assert.equal(externalLabel.controls, control.id);
    assert.equal(control.label, '');
    assert.equal(control.labelledBy, externalLabel.id);
    assert.equal(control.children[0].label, '');
    assert.equal(control.children[0].id, control.controls);
  });
}

function unnamedOptions(kind, open, labelVisibility) {
  const { state, ...options } = selectOptions({ label: '', labelVisibility });
  const interaction = { ...state.interaction, activeId: 'us' };
  return kind === 'select'
    ? { ...options, state: { kind, open, interaction } }
    : { ...options, view: { kind, open, ...interaction, input: { text: 'Europe', cursor: 6 } } };
}

test('hidden autocomplete labels align wide-text caret and pointer positions with the first cell', () => {
  const options = {
    id: 'language',
    label: 'Long language label',
    labelVisibility: 'hidden',
    required: true,
    ...createOptionsFixture([]),
    view: {
      kind: 'autocomplete',
      open: false,
      input: { text: '你ab', cursor: 3 },
      selection: { mode: 'single' },
    },
    onTransition: (transition) => ({ transition }),
  };
  const size = { columns: 10, rows: 1 };
  const frame = renderElementFrame(combobox(options), size, { focusPath: ['language'] });
  const target = renderElementRegions(combobox(options), size)
    .flatMap(region => region.hitTargets).find(candidate => candidate.id === 'language:trigger');

  assert.match(renderFramePlain(frame), /^你ab /u);
  assert.equal(measureElement(combobox(options), size).preferredWidth, 6);
  assert.equal(frame.cursor.column, 5);
  assert.equal(frame.accessibility.root.label, 'Long language label');
  assert.equal(frame.accessibility.root.required, true);
  assert.deepEqual(pointerDown(target, 3).transition, {
    kind: 'pointer', transition: { kind: 'placeCaret', offset: 1 },
  });
});

test('hidden autocomplete labels align clipped text windows and empty-input placeholders', () => {
  const options = {
    id: 'completion',
    label: 'Completion',
    labelVisibility: 'hidden',
    ...createOptionsFixture([]),
    view: {
      kind: 'autocomplete',
      open: false,
      input: { text: 'abcdefgh', cursor: 8 },
      selection: { mode: 'single' },
    },
    onTransition: (transition) => ({ transition }),
  };
  const size = { columns: 7, rows: 1 };
  const frame = renderElementFrame(combobox(options), size, { focusPath: ['completion'] });
  const target = renderElementRegions(combobox(options), size)
    .flatMap(region => region.hitTargets).find(candidate => candidate.id === 'completion:trigger');

  assert.match(renderFramePlain(frame), /^‹efgh /u);
  assert.equal(frame.cursor.column, 6);
  assert.deepEqual(pointerDown(target, 2).transition, {
    kind: 'pointer', transition: { kind: 'placeCaret', offset: 4 },
  });
  const empty = combobox({
    ...options,
    placeholder: 'Pick',
    view: { ...options.view, input: { text: '', cursor: 0 } },
  });
  const emptyFrame = renderElementFrame(empty, size, { focusPath: ['completion'] });
  assert.match(renderFramePlain(emptyFrame), /^Pick /u);
  assert.equal(emptyFrame.cursor.column, 1);
  assert.equal(measureElement(empty, size).preferredWidth, 6);
});

test('combobox label visibility rejects unsupported policies and still requires a label', () => {
  for (const labelVisibility of [true, false, null, '', 'none', 'hidden-label']) {
    assert.throws(() => combobox(selectOptions({ labelVisibility })), /labelVisibility must be one of visible, hidden/u);
  }
  const options = selectOptions({ labelVisibility: 'hidden' });
  delete options.label;
  assert.throws(() => combobox(options), /combobox label must be a string/u);
});

function pointerDown(target, localColumn) {
  assert.ok(target);
  const row = target.bounds.row;
  const column = target.bounds.column + localColumn - 1;
  return target.message({
    source: 'mouse',
    kind: 'pointerDown',
    button: 'left',
    row,
    column,
    localRow: 1,
    localColumn,
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
      row,
      column,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false },
    },
  });
}
