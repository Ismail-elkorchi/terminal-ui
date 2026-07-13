import assert from 'node:assert/strict';
import test from 'node:test';

import { button, inspectElement, textInput } from '../../dist/components/index.js';
import { column, surface } from '../../dist/layout/index.js';

test('element inspection exposes an immutable authoring projection without renderer payloads', () => {
  const element = surface(column([
    textInput({
      id: 'query',
      value: '',
      onEdit: (operation) => ({ kind: 'query', operation }),
      meta: {
        styles: {
          parts: { value: { bold: true } },
          states: { focused: { underline: true } }
        }
      }
    }),
    button({ id: 'submit', label: 'Search', onPress: { kind: 'submit' } })
  ], { id: 'controls' }), { id: 'panel', variant: 'raised' });

  const inspection = inspectElement(element);

  assert.deepEqual(inspection, {
    schemaVersion: 'terminal-ui.element.v1',
    component: 'surface',
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
      schemaVersion: 'terminal-ui.element.v1',
      component: 'column',
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
          schemaVersion: 'terminal-ui.element.v1',
          component: 'textInput',
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
          schemaVersion: 'terminal-ui.element.v1',
          component: 'button',
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
  assert.equal('renderer' in inspection, false);
});

test('element inspection rejects objects outside the authored element boundary', () => {
  assert.throws(
    () => inspectElement({}),
    /Expected an Element created by a terminal-ui component or layout factory/u
  );
});
