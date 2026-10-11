import assert from 'node:assert/strict';
import test from 'node:test';

import { defineComponent, ignoreMessage } from '../../../dist/component/index.js';
import { button, inspectElement } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { renderElementFrame } from '../../../dist/renderer/index.js';
import { keyInput } from '../../../dist/testing/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const size = { columns: 12, rows: 2 };
const measure = () => ({ minWidth: 1, minHeight: 1, preferredWidth: 8, preferredHeight: 1 });
const semantic = {
  name: 'terminal-ui-tests/output-contract', identity: 'required', semantics: 'semantic',
  accessibleRole: 'group', accessibility: ({ id, children, focused }) => ({ id, children, focused }),
};
const leaf = { ...semantic, structure: 'leaf', measure, render() {} };

function runtimeFor(view) {
  return createTuiRuntime({
    host: createMemoryTerminalHost({ terminalSize: size }),
    app: defineTui({
      id: 'output-contract-runtime', init: () => ({ state: [] }),
      update: (state, message) => ({ state: [...state, message] }), view,
    }),
  });
}

for (const structure of ['composed', 'composite']) {
  test(`${structure}-only actions use their declared witness and map exactly once`, async () => {
    let mappings = 0;
    const child = ({ emit }) => button({ id: 'child', label: 'Run', onPress: () => emit('activate') });
    const factory = defineComponent({
      ...semantic, structure, emitsActions: true,
      ...(structure === 'composed' ? { compose: child } : {
        slots: { content: { owner: 'implementation', cardinality: 'one', messages: 'bubble' } },
        implementationSlots: input => ({ content: child(input) }), measure,
        layout: ({ bounds }) => ({ content: bounds }),
      }),
    });
    const runtime = runtimeFor(() => factory({ id: 'owner', onAction: action => {
      mappings += 1;
      return { kind: action };
    } }));
    try {
      await runtime.start();
      await runtime.handleInput(keyInput('enter'));
      assert.deepEqual(runtime.state(), [{ kind: 'activate' }]);
      assert.equal(mappings, 1);
    } finally { await runtime.dispose(); }
  });
}

test('actionless owners allow bubbled child messages and ignore-only key hooks', async () => {
  const ignoring = defineComponent({
    ...leaf, emitsActions: false, focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    keys: () => ({ enter: () => ignoreMessage() }),
  });
  const runtime = runtimeFor(() => ignoring({ id: 'ignore' }));
  try {
    await runtime.start();
    await runtime.handleInput(keyInput('enter'));
    assert.deepEqual(runtime.state(), []);
  } finally { await runtime.dispose(); }
  const owner = defineComponent({
    ...semantic, structure: 'composed',
    slots: { content: { owner: 'caller', cardinality: 'one', messages: 'bubble' } },
    compose: ({ slots }) => slots.content,
  });
  const bubbling = runtimeFor(() => owner({ id: 'owner', slots: {
    content: button({ id: 'child', label: 'Run', onPress: () => 'child-message' }),
  } }));
  try {
    await bubbling.start();
    await bubbling.handleInput(keyInput('enter'));
    assert.deepEqual(bubbling.state(), ['child-message']);
  } finally { await bubbling.dispose(); }
});

test('JavaScript action witnesses reject malformed values and invalid mapper combinations', () => {
  for (const emitsActions of [null, 0, 'true', {}, []]) {
    assert.throws(() => defineComponent({ ...leaf, emitsActions }), /emitsActions/u);
  }
  for (const emitsActions of [undefined, false]) {
    const factory = defineComponent({ ...leaf, ...(emitsActions === undefined ? {} : { emitsActions }) });
    assert.throws(() => factory({ id: 'owner', onAction: value => value }), /onAction/u);
  }
  const factory = defineComponent({ ...leaf, emitsActions: true, states: ['disabled', 'inert', 'busy', 'readOnly'] });
  for (const state of [{}, { disabled: true }, { inert: true }, { busy: true }, { readOnly: true }]) {
    assert.throws(() => factory({ id: 'owner', ...state }), /onAction/u);
    assert.throws(() => factory({ id: 'owner', ...state, onAction: 'not-a-function' }), /onAction/u);
    assert.doesNotThrow(() => factory({ id: 'owner', ...state, onAction: value => value }));
  }
});

test('an actionless JavaScript hook cannot leak actions while ignore bypasses the mapper', async () => {
  const invalid = defineComponent({
    ...leaf, focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    keys: () => ({ enter: () => 'undeclared-action' }),
  });
  const runtime = runtimeFor(() => invalid({ id: 'invalid' }));
  try {
    await runtime.start();
    await assert.rejects(runtime.handleInput(keyInput('enter')), /action|emitsActions/iu);
    assert.deepEqual(runtime.state(), []);
  } finally { await runtime.dispose(); }
  let mappings = 0;
  const ignoring = defineComponent({
    ...leaf, emitsActions: true, focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    keys: () => ({ enter: () => ignoreMessage() }),
  });
  const ignoredRuntime = runtimeFor(() => ignoring({ id: 'ignore', onAction: value => { mappings += 1; return value; } }));
  try {
    await ignoredRuntime.start();
    await ignoredRuntime.handleInput(keyInput('enter'));
    assert.equal(mappings, 0);
    assert.deepEqual(ignoredRuntime.state(), []);
  } finally { await ignoredRuntime.dispose(); }
});

for (const unavailable of ['disabled', 'inert']) {
  test(`${unavailable} lifecycle layout actions retain a required binding`, async () => {
    let notified = false;
    const factory = defineComponent({
      ...leaf, emitsActions: true, states: [unavailable],
      onLayout: () => {
        if (notified) return ignoreMessage();
        notified = true;
        return 'laid-out';
      },
    });
    const runtime = runtimeFor(() => factory({ id: 'owner', [unavailable]: true, onAction: value => value }));
    try {
      await runtime.start();
      assert.deepEqual(runtime.state(), ['laid-out']);
    } finally { await runtime.dispose(); }
  });
}

for (const state of ['busy', 'readOnly']) {
  test(`${state} is not treated as unavailable when routing declared actions`, async () => {
    const factory = defineComponent({
      ...leaf, emitsActions: true, states: [state],
      focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
      keys: () => ({ enter: () => 'activate' }),
    });
    const runtime = runtimeFor(() => factory({ id: 'owner', [state]: true, onAction: value => value }));
    try {
      await runtime.start();
      await runtime.handleInput(keyInput('enter'));
      assert.deepEqual(runtime.state(), ['activate']);
    } finally { await runtime.dispose(); }
  });
}

for (const role of ['group', 'button', undefined]) {
  test(`JavaScript accessibility roots reject an authored role (${String(role)})`, () => {
    const factory = defineComponent({ ...leaf, accessibility: ({ id }) => ({ id, role }) });
    assert.throws(() => renderElementFrame(factory({ id: 'owner' }), size), /role/iu);
  });
}

test('resolved static and dynamic roles agree across fresh, retained, and inspected output', async () => {
  for (const dynamic of [false, true]) {
    let role = 'group';
    let accessibilityCalls = 0;
    const factory = defineComponent({
      ...leaf,
      accessibleRole: dynamic ? () => role : 'group',
      reuse: { accessibility: () => [role] },
      accessibility: ({ id }) => {
        accessibilityCalls += 1;
        return { id, label: 'Owner', children: [{ id: 'descendant', role: 'text', label: 'Child' }] };
      },
    });
    const view = () => factory({ id: 'owner' });
    const runtime = runtimeFor(view);
    try {
      await runtime.start();
      const first = runtime.frame().accessibility;
      const calls = accessibilityCalls;
      await runtime.redraw();
      assert.deepEqual(runtime.frame().accessibility, first);
      assert.equal(accessibilityCalls, calls, 'stable dependencies reuse accessibility');
      assert.equal(inspectElement(view()).component.accessibleRole, 'group');
      assert.deepEqual(runtime.frame().accessibility.root, renderElementFrame(view(), size).accessibility.root);
      assert.equal(first.root.role, 'group');
      assert.equal(first.root.children[0].role, 'text');
      if (dynamic) {
        role = 'application';
        await runtime.redraw();
        assert.equal(runtime.frame().accessibility.root.role, 'application');
        assert.equal(inspectElement(view()).component.accessibleRole, 'application');
        assert.deepEqual(runtime.frame().accessibility.root, renderElementFrame(view(), size).accessibility.root);
      }
    } finally { await runtime.dispose(); }
  }
});

for (const unavailable of ['disabled', 'inert']) {
  test(`${unavailable} transitions preserve mapped focus-leave lifecycle actions`, async () => {
    const factory = defineComponent({
      ...leaf, emitsActions: true, states: [unavailable],
      focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
      onFocus: event => event.kind,
      onFocusTarget: event => event.kind,
    });
    const runtime = createTuiRuntime({
      host: createMemoryTerminalHost({ terminalSize: size }),
      app: defineTui({
        id: 'focus-output-runtime',
        init: () => ({ state: { unavailable: false, messages: [] } }),
        update: (state, message) => ({ state: message === 'disable'
          ? { ...state, unavailable: true }
          : { ...state, messages: [...state.messages, message] } }),
        view: state => factory({ id: 'owner', [unavailable]: state.unavailable, onAction: action => action }),
      }),
    });
    try {
      await runtime.start();
      assert.deepEqual(runtime.state().messages, ['focusEnter', 'focusTargetEnter']);
      await runtime.dispatch('disable');
      assert.deepEqual(runtime.state().messages, ['focusEnter', 'focusTargetEnter', 'focusTargetLeave', 'focusLeave']);
    } finally { await runtime.dispose(); }
  });
}
