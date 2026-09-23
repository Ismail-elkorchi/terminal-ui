import assert from 'node:assert/strict';
import test from 'node:test';

import { defineTui } from '../../dist/tui/index.js';
import { input, password, progress, select } from '../../dist/prompts/index.js';
import { defineTheme, mergeThemes, defaultTheme } from '../../dist/theme/index.js';
import { decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { textInput, passwordInput } from '../../dist/components/index.js';
import { componentElement } from '../helpers/component-definition.mjs';

const tui = { init: () => 0, update: () => 0, view: () => undefined };

test('JavaScript TUI definitions and bindings reject misspelled framework options at admission', () => {
  assert.throws(() => defineTui({ ...tui, inputBinding: [] }), /tui\.inputBinding/u);
  assert.throws(() => defineTui({ ...tui, nonTty: { mode: 'reject', diagnosticHnit: 'secret' } }),
    /tui\.nonTty\.diagnosticHnit/u);
  const binding = { id: 'save', triggers: [{ kind: 'key', key: 'enter' }], message: { value: 'app payload' } };
  assert.throws(() => defineTui({ ...tui, inputBindings: [{ ...binding, lable: 'Save' }] }),
    /tui\.inputBindings\[0\]\.lable/u);
  assert.throws(() => defineTui({ ...tui, inputBindings: [{
    ...binding, triggers: [{ kind: 'key', key: 'enter', modifiers: { crtl: true } }]
  }] }), /tui\.inputBindings\[0\]\.triggers\[0\]\.modifiers\.crtl/u);
  assert.doesNotThrow(() => defineTui({ ...tui, inputBindings: [binding] }));
});

test('prompt kinds reject unknown options and nested policy keys while accepting application values', () => {
  assert.throws(() => input({ label: 'Name', validator: () => true }), /input options\.validator/u);
  assert.throws(() => password({ label: 'Password', accessibility: { iD: 'pass' } }),
    /prompt\.accessibility\.iD/u);
  assert.throws(() => input({ label: 'Name', nonTty: { mode: 'reject', diagnosticHnit: 'secret' } }),
    /prompt\.nonTty\.diagnosticHnit/u);
  assert.throws(() => progress({ label: 'Work', progress: { kind: 'indeterminate', valu: 1 } }),
    /prompt\.progress\.valu/u);
  const value = { arbitrary: { userOwned: true } };
  assert.equal(input({ label: 'Name', nonTty: { mode: 'provided_value', value } }).nonTty.value, value);
  assert.equal(select({ label: 'Choice', choices: [{ label: 'One', value }] }).choices[0].value, value);
});

test('theme definition, token, symbol, and color typos report their field paths', () => {
  assert.throws(() => defineTheme({ token: {} }), /theme\.token/u);
  assert.throws(() => defineTheme({ tokens: { colour: {} } }), /theme\.tokens\.colour/u);
  assert.throws(() => defineTheme({ tokens: { symbols: { borderRounded: { topLef: '+' } } } }),
    /theme\.tokens\.symbols\.borderRounded\.topLef/u);
  assert.throws(() => defineTheme({ tokens: { colors: { 'status.error': { kind: 'ansi', valu: 2 } } } }),
    /theme\.tokens\.colors\.status\.error\.valu/u);
  assert.throws(() => mergeThemes(defaultTheme, { tokens: { symbols: { pointr: '>' } } }),
    /theme\.tokens\.symbols\.pointr/u);
  assert.doesNotThrow(() => defineTheme({ tokens: { colors: { 'custom.brand': { kind: 'ansi', value: 1 } } } }));
});

function snapshot(root) {
  return decodeAccessibleSnapshot({ source: 'renderer', root, focusPath: [], diagnostics: [] });
}

test('accessibility errors name the invalid node path and relationship endpoint without values', () => {
  const sensitive = 'private-control-value-17892';
  const children = Array.from({ length: 60 }, (_, index) => ({ id: `valid-${index}`, role: 'text', value: 'ok' }));
  children.push({ id: 'missing-name-field', role: 'textbox', value: sensitive });
  const unnamed = snapshot({ id: 'app', role: 'group', children: [{ id: 'form', role: 'group', children }] });
  assert.equal(unnamed.status, 'failure');
  assert.equal(unnamed.error.target, 'missing-name-field');
  assert.match(unnamed.error.message, /missing-name-field.*"app" \/ "form" \/ "missing-name-field"/u);
  assert.doesNotMatch(unnamed.error.message, /private-control-value/u);

  const broken = snapshot({ id: 'app', role: 'group', children: [{
    id: 'form', role: 'group', children: [{ id: 'password', role: 'textbox', value: sensitive, labelledBy: 'missing-label' }]
  }] });
  assert.equal(broken.status, 'failure');
  assert.equal(broken.error.target, 'password');
  assert.match(broken.error.message, /labelledBy.*missing-label.*"app" \/ "form" \/ "password"/u);
  assert.doesNotMatch(broken.error.message, /private-control-value/u);

  const wrongRole = snapshot({ id: 'app', role: 'group', children: [
    { id: 'panel', role: 'tabpanel', labelledBy: 'wrong-label' },
    { id: 'wrong-label', role: 'text', value: 'Section' }
  ] });
  assert.equal(wrongRole.status, 'failure');
  assert.equal(wrongRole.error.target, 'panel');
  assert.match(wrongRole.error.message, /labelledBy endpoint "wrong-label" has role text.*"app" \/ "panel"/u);
});

test('external labels satisfy names and renderer errors identify the source component and instance', () => {
  const sensitive = 'private-control-value-17892';
  const definition = {
    name: 'test/form',
    structure: 'leaf',
    identity: 'required',
    accessibleRole: 'group',
    parts: [],
    createModel: (value) => value,
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() {},
    accessibility: ({ id }) => ({
      id, role: 'group', children: [
        { id: 'name-label', role: 'text', value: 'Name', controls: 'name-field' },
        { id: 'name-field', role: 'textbox', value: sensitive }
      ]
    })
  };
  const valid = renderElementFrame(componentElement({ id: 'form-instance', definition }), { columns: 12, rows: 2 });
  assert.equal(valid.accessibility.root.children[1].labelledBy, 'name-label');

  const invalid = {
    ...definition,
    accessibility: ({ id }) => ({
      id, role: 'group', children: [{ id: 'nested', role: 'group', children: [
        { id: 'missing-name-field', role: 'textbox', value: sensitive }
      ] }]
    })
  };
  assert.throws(
    () => renderElementFrame(componentElement({ id: 'form-instance', definition: invalid }), { columns: 12, rows: 2 }),
    (error) => {
      assert.match(error.message, /component "test\/form" \(instance "form-instance"\)/u);
      assert.match(error.message, /"form-instance" \/ "nested" \/ "missing-name-field"/u);
      assert.doesNotMatch(error.message, /private-control-value/u);
      return true;
    }
  );

  const missingControl = {
    ...definition,
    accessibility: ({ id }) => ({
      id, role: 'group', children: [{ id: 'name-label', role: 'text', value: 'Name', controls: 'missing-control' }]
    })
  };
  assert.throws(
    () => renderElementFrame(componentElement({ id: 'form-instance', definition: missingControl }), { columns: 12, rows: 2 }),
    (error) => {
      assert.match(error.message, /component "test\/form" \(instance "form-instance"\)/u);
      assert.match(error.message, /name-label.*missing-control.*"form-instance" \/ "name-label"/u);
      return true;
    }
  );

  const invalidRoot = { ...definition, accessibility: () => ({ id: '', role: 'group' }) };
  assert.throws(
    () => renderElementFrame(componentElement({ id: 'form-instance', definition: invalidRoot }), { columns: 12, rows: 2 }),
    /component "test\/form" \(instance "form-instance"\).*node id at root/u,
  );
});

test('built-in text and password controls report their IDs without exposing typed values', () => {
  const sensitive = 'private-control-value-17892';
  for (const [factory, name] of [
    [textInput, 'text-input'],
    [passwordInput, 'password-input'],
  ]) {
    assert.throws(
      () => renderElementFrame(factory({
        id: 'missing-name-field',
        state: { text: sensitive, cursor: 0 },
        onTransition: () => undefined,
      }), { columns: 20, rows: 2 }),
      (error) => {
        assert.match(error.message, new RegExp(`component "terminal-ui/components/${name}" \\(instance "missing-name-field"\\)`, 'u'));
        assert.match(error.message, /Node "missing-name-field" at "missing-name-field"/u);
        assert.doesNotMatch(error.message, /private-control-value/u);
        return true;
      },
    );
  }
});
