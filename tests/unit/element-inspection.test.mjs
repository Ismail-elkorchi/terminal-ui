import assert from 'node:assert/strict';
import test from 'node:test';

import {
  barChart,
  button,
  inspectElement,
  notificationHistory,
  notificationRegion,
  select,
  text,
  textInput
} from '../../dist/components/index.js';
import { column, row, surface, viewport } from '../../dist/layout/index.js';
import {
  componentElement,
  compositeComponentDefinition,
  leafComponentDefinition
} from '../helpers/component-definition.mjs';
import { renderElementFrame } from '../../dist/renderer/index.js';

test('element inspection exposes an immutable factory description without implementation payloads', () => {
  const element = surface(column([
    textInput({
      id: 'query',
      presentation: { value: '', cursor: 0 },
      onAction: (action) => ({ kind: 'query', action }),
      meta: {
        styles: {
          parts: { value: { bold: true } },
          states: { focused: { underline: true } }
        }
      }
    }),
    button({ id: 'submit', label: 'Search', onPress: () => ({ kind: 'submit' }) })
  ], { id: 'controls' }), { id: 'panel', appearance: 'raised' });

  const inspection = inspectElement(element);

  assert.deepEqual(inspection, {
    factory: { category: 'layout', origin: 'builtin', name: 'surface' },
    id: 'panel',
    inputs: { keyboard: false, text: false, paste: false, focus: 'none' },
    meta: {
      accessibility: false,
      styled: false,
      styleParts: [],
      styleStates: [],
      layered: false
    },
    children: [{
      factory: { category: 'layout', origin: 'builtin', name: 'column' },
      id: 'controls',
      inputs: { keyboard: false, text: false, paste: false, focus: 'none' },
      meta: {
        accessibility: false,
        styled: false,
        styleParts: [],
        styleStates: [],
        layered: false
      },
      children: [
        {
          factory: { category: 'component', origin: 'builtin', name: 'textInput' },
          id: 'query',
          inputs: { keyboard: true, text: true, paste: true, focus: 'item' },
          meta: {
            accessibility: false,
            styled: true,
            styleParts: ['value'],
            styleStates: ['focused'],
            layered: false
          },
          children: []
        },
        {
          factory: { category: 'component', origin: 'builtin', name: 'button' },
          id: 'submit',
          inputs: { keyboard: true, text: false, paste: false, focus: 'item' },
          meta: {
            accessibility: false,
            styled: false,
            styleParts: [],
            styleStates: [],
            layered: false
          },
          children: []
        }
      ]
    }]
  });
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
    origin: 'defined',
    name: 'terminal-ui-tests/components/testLeaf'
  });
  assert.equal(inspection.id, 'plug-in');
  assert.equal('definition' in inspection, false);
});

test('element inspection keeps factory origin independent from public names', () => {
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
    origin: 'defined',
    name: 'terminal-ui-tests/components/row'
  });
  assert.deepEqual(layoutInspection.factory, {
    category: 'layout',
    origin: 'builtin',
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
  const passiveViewport = viewport(text('content'), {
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
    onPress: () => undefined
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
    onDismiss: (id) => id
  });
  const notificationArchive = notificationHistory({
    id: 'notification-archive',
    items: [],
    onAction: (action) => action
  });
  assert.equal(inspectElement(dismissibleNotifications).inputs.focus, 'item');
  assert.equal(inspectElement(notificationArchive).inputs.focus, 'item');

  const focusScope = componentElement({
    id: 'component-scope-inspection',
    children: [button({ id: 'scoped-button', label: 'Scoped', onPress: () => undefined })],
    definition: {
      ...compositeComponentDefinition,
      layout: ({ bounds }) => [bounds],
      accessibility: ({ id, children }) => ({ id, role: 'group', label: id, children })
    },
    meta: { focus: { scope: { kind: 'contain' } } }
  });
  assert.equal(inspectElement(focusScope).inputs.focus, 'scope');
});

test('element inspection omits private implementation children with no public factory', () => {
  const inspection = inspectElement(select({
    id: 'choice',
    options: [{ id: 'alpha', label: 'Alpha', value: 'alpha' }],
    presentation: { kind: 'open', selected: 'alpha', highlighted: 'alpha' },
    onAction: () => undefined
  }));

  assert.deepEqual(inspection.children, []);
});

test('element inspection rejects objects outside the element factory boundary', () => {
  assert.throws(
    () => inspectElement({}),
    /component or layout factory/u
  );
});
