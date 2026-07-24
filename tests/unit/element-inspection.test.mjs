import assert from 'node:assert/strict';
import test from 'node:test';

import { button, inspectElement, textInput } from '../../dist/components/index.js';
import { column, surface } from '../../dist/layout/index.js';
import { custom } from '../../dist/renderer/index.js';

test('element inspection exposes an immutable authoring projection without renderer payloads', () => {
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
    schemaVersion: 'terminal-ui.element.v1',
    kind: 'surface',
    category: 'layout',
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
      kind: 'column',
      category: 'layout',
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
          kind: 'textInput',
          category: 'component',
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
          kind: 'button',
          category: 'component',
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

test('element inspection identifies custom renderer elements without changing dispatch', () => {
  const element = custom({
    id: 'plug-in',
    renderer: {
      render() {},
      accessibility: ({ id }) => ({ id, role: 'text', label: 'Plug-in' })
    }
  });

  const inspection = inspectElement(element);

  assert.equal(inspection.kind, 'custom');
  assert.equal(inspection.category, 'extension');
  assert.equal(inspection.id, 'plug-in');
  assert.equal('renderer' in inspection, false);
});

test('element inspection rejects objects outside the authored element boundary', () => {
  assert.throws(
    () => inspectElement({}),
    /component, layout, or renderer-extension factory/u
  );
});
