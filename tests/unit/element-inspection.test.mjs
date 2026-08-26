import assert from 'node:assert/strict';
import test from 'node:test';

import {
  barChart,
  button,
  inspectElement,
  notificationHistory,
  notificationRegion,
  passwordInput,
  combobox,
  text,
  textArea,
  textInput
} from '../../dist/components/index.js';
import { column, row, surface, viewport } from '../../dist/layout/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import {
  componentElement,
  compositeComponentDefinition,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { createTextDocument, textCaretAt } from '../../dist/text/index.js';
import { createScrollState } from '../../dist/behavior/index.js';

test('element inspection exposes an immutable factory description without implementation payloads', () => {
  const element = surface(column([
    textInput({ meta: { accessibleName: "Text input" },
      id: 'query',
      state: { value: '', cursor: 0 },
      onTransition: (action) => ({ kind: 'query', action }),
      styles: {
          parts: { value: { bold: true } },
          states: { focused: { root: { underline: true } } }
        }
    }),
    button({ id: 'submit', label: 'Search', onPress: () => ({ kind: 'submit' }) })
  ], { id: 'controls' }), { id: 'panel', appearance: 'raised' });

  const inspection = inspectElement(element);

  assert.equal(inspection.factory.name, 'surface');
  assert.equal(inspection.id, 'panel');
  const controls = inspection.children[0];
  const query = controls?.children[0];
  const submit = controls?.children[1];
  assert.equal(controls?.factory.name, 'column');
  assert.equal(query?.component?.accessibleRole, 'textbox');
  assert.deepEqual(query?.component?.actions, ['keyboard', 'input', 'paste', 'pointer']);
  assert.deepEqual(
    query?.component?.styleParts,
    ['border', 'label', 'value', 'placeholder', 'selection', 'cursor', 'error'],
  );
  assert.deepEqual(
    query?.component?.visualStates,
    ['focused', 'selected', 'disabled', 'readOnly'],
  );
  assert.deepEqual(query?.meta.configuredStyleParts, ['value']);
  assert.deepEqual(query?.meta.configuredStyleStates, ['focused']);
  assert.deepEqual(query?.semantic?.validation, { required: false, invalid: false });
  assert.equal(query?.semantic?.value, '');
  assert.equal(submit?.component?.accessibleRole, 'button');
  assert.deepEqual(submit?.component?.styleParts, ['frame', 'marker', 'leading', 'label', 'trailing']);
  assert.deepEqual(
    submit?.component?.visualStates,
    ['focused', 'hovered', 'pressed', 'disabled', 'busy'],
  );
  assert.equal(submit?.semantic, undefined);
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(inspection.children), true);
  assert.equal('props' in inspection, false);
  assert.equal('definition' in inspection, false);
});

test('element inspection identifies defined components without exposing their definition', () => {
  const element = componentElement({
    id: 'plug-in',
    definition: {
      ...leafComponentDefinition,
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: 'Plug-in' })
    }
  });

  const inspection = inspectElement(element);

  assert.deepEqual(inspection.factory, {
    category: 'component',
    name: 'terminal-ui-tests/components/testLeaf'
  });
  assert.equal(inspection.id, 'plug-in');
  assert.equal('definition' in inspection, false);
});

test('element inspection never exposes sensitive component model', () => {
  const inspection = inspectElement(passwordInput({ meta: { accessibleName: "Password input" },
    id: 'secret',
    state: { value: 'correct horse battery staple', cursor: 28 },
    required: true,
    disabled: true
  }));
  const serialized = JSON.stringify(inspection);

  assert.doesNotMatch(serialized, /correct horse battery staple/u);
  assert.equal(inspection.semantic?.redacted, true);
  assert.deepEqual(inspection.semantic?.validation, { required: true, invalid: false });
});

test('built-in inspection summarizes valid values larger than its tooling budget', () => {
  const value = 'x'.repeat(5_000);
  const inputInspection = inspectElement(textInput({ meta: { accessibleName: "Text input" },
    id: 'large-input',
    state: { value, cursor: value.length },
    disabled: true
  }));
  const areaInspection = inspectElement(textArea({ meta: { accessibleName: "Text area" },
    id: 'large-area',
    state: {
      document: createTextDocument(value),
      caret: textCaretAt(value.length)
    },
    disabled: true
  }));
  const summary = { kind: 'text-summary', codeUnitLength: value.length, truncated: true };

  assert.deepEqual(inputInspection.semantic?.value, summary);
  assert.deepEqual(areaInspection.semantic?.value, summary);
});

test('element inspection adopts explicit definition-owned semantic descriptions', () => {
  const active = { id: 'one' };
  const element = componentElement({
    id: 'inspected',
    secret: 'private model value',
    definition: {
      ...leafComponentDefinition,
      createModel: (value) => ({ renamedPrivateField: value.secret }),
      inspection: () => ({ active }),
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: id })
    }
  });

  active.id = 'changed';
  const inspection = inspectElement(element);
  assert.deepEqual(inspection.semantic, { active: { id: 'one' } });
  assert.equal(Object.isFrozen(inspection.semantic.active), true);
  assert.doesNotMatch(JSON.stringify(inspection), /private model value/u);
});

test('element inspection validates hook output at the component boundary', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => componentElement({
      id: 'cyclic-inspection',
      definition: {
        ...leafComponentDefinition,
        inspection: () => ({ details: cyclic }),
        render() {},
        accessibility: ({ id }) => ({ id, role: 'text', label: id })
      }
    }),
    /inspection.*cycles/u
  );

  let details = { leaf: true };
  for (let depth = 0; depth < 10; depth += 1) details = { nested: details };
  assert.throws(
    () => componentElement({
      id: 'deep-inspection',
      definition: {
        ...leafComponentDefinition,
        inspection: () => ({ details }),
        render() {},
        accessibility: ({ id }) => ({ id, role: 'text', label: id })
      }
    }),
    /inspection.*levels/u
  );
});

test('element inspection resolves model-dependent accessibility roles', () => {
  assert.equal(inspectElement(text({ content: 'Title', textRole: 'heading' })).component?.accessibleRole, 'heading');
  assert.equal(inspectElement(text({ content: 'Body' })).component?.accessibleRole, 'text');
});

test('element inspection keeps factory category independent from diagnostic names', () => {
  const namedRow = componentElement({
    id: 'same',
    children: [],
    definition: {
      ...compositeComponentDefinition,
      name: 'terminal-ui-tests/components/row',
      layout: () => [],
      accessibility: ({ id }) => ({ id, role: 'group', label: id })
    }
  });
  const layoutRow = row([], { id: 'same' });

  const componentInspection = inspectElement(namedRow);
  const layoutInspection = inspectElement(layoutRow);
  assert.deepEqual(componentInspection.factory, {
    category: 'component',
    name: 'terminal-ui-tests/components/row'
  });
  assert.deepEqual(layoutInspection.factory, {
    category: 'layout',
    name: 'row'
  });
});

test('element inspection reports factory-declared focus capability instead of generic metadata', () => {
  const passiveComponent = componentElement({
    id: 'passive-component',
    definition: {
      ...leafComponentDefinition,
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: id })
    }
  });
  const passiveComposite = componentElement({
    id: 'passive-composite',
    children: [],
    definition: {
      ...compositeComponentDefinition,
      layout: () => [],
      accessibility: ({ id }) => ({ id, role: 'group', label: id })
    }
  });
  const passiveChart = barChart({
    id: 'passive-chart',
    label: 'Passive chart',
    items: [{ id: 'one', label: 'One', value: 1 }]
  });
  const passiveViewport = viewport(text({ content: 'content' }), {
    id: 'passive-viewport',
    offset: { row: 0, column: 0 }
  });
  const passiveNotifications = notificationRegion({
    id: 'passive-notifications',
    items: [{ id: 'one', title: 'One' }]
  });

  for (const element of [
    passiveComponent,
    passiveComposite,
    passiveChart,
    passiveViewport,
    passiveNotifications
  ]) {
    assert.equal(inspectElement(element).inputs.focus, 'none');
    assert.equal(renderElementFrame(element, { columns: 12, rows: 2 }).focusPath, undefined);
  }

  const disabledButton = button({
    id: 'disabled-button-inspection',
    label: 'Disabled',
    disabled: true
  });
  assert.equal(inspectElement(disabledButton).inputs.focus, 'none');
  assert.equal(renderElementFrame(disabledButton, { columns: 12, rows: 1 }).focusPath, undefined);

  const busyButton = button({
    id: 'busy-button-inspection',
    label: 'Busy',
    busy: true,
    onPress: () => ignoreMessage()
  });
  assert.equal(inspectElement(busyButton).inputs.focus, 'item');
  assert.deepEqual(
    renderElementFrame(busyButton, { columns: 12, rows: 1 }).focusPath,
    ['busy-button-inspection']
  );

  const focusableComponent = componentElement({
    id: 'focusable-component-inspection',
    definition: {
      ...leafComponentDefinition,
      accessibleRole: 'button',
      render() {},
      accessibility: ({ id, focused }) => ({
        id,
        role: 'button',
        label: id,
        ...(focused ? { focused } : {})
      }),
      focusTargets: ({ bounds }) => [{ id: 'self', bounds }]
    }
  });
  assert.equal(inspectElement(focusableComponent).inputs.focus, 'item');

  const dismissibleNotifications = notificationRegion({
    id: 'dismissible-notifications',
    items: [{ id: 'one', title: 'One' }],
    onDismiss: (action) => action
  });
  const notificationArchive = notificationHistory({ meta: { accessibleName: "Notification history" },
    id: 'notification-archive',
    items: [],
    scroll: createScrollState(),
    onTransition: (action) => action
  });
  assert.equal(inspectElement(dismissibleNotifications).inputs.focus, 'item');
  assert.equal(inspectElement(notificationArchive).inputs.focus, 'item');

  const focusScope = componentElement({
    id: 'component-scope-inspection',
    children: [button({ id: 'scoped-button', label: 'Scoped', onPress: () => ignoreMessage() })],
    definition: {
      ...compositeComponentDefinition,
      layout: ({ bounds }) => [bounds],
      focusScope: () => ({ kind: 'contain' }),
      accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
    }
  });
  assert.equal(inspectElement(focusScope).inputs.focus, 'scope');
});

test('element inspection omits private implementation children with no public factory', () => {
  const inspection = inspectElement(combobox({
    id: 'choice',
    label: 'Choice',
    options: [{ id: 'alpha', label: 'Alpha', value: 'alpha' }],
    state: {
      kind: 'select',
      open: true,
      interaction: { activeId: 'alpha', selection: { mode: 'single', selectedId: 'alpha' } }
    },
    onTransition: () => ignoreMessage()
  }));

  assert.deepEqual(inspection.children, []);
});

test('element inspection rejects objects outside the element factory boundary', () => {
  assert.throws(
    () => inspectElement({}),
    /component or layout factory/u
  );
});
