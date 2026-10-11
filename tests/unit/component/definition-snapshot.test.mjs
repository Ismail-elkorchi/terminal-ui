import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { inspectElement, text } from '../../../dist/components/index.js';
import { renderElementFrame } from '../../../dist/renderer/index.js';
import { compileDefinition } from '../../../dist/component/internal/compile-definition.js';

function mutableDefinition() {
  return {
    name: 'terminal-ui-tests/components/snapshot',
    identity: 'required',
    structure: 'composite',
    semantics: 'semantic',
    accessibleRole: 'group',
    states: ['disabled'],
    metadata: ['layer', 'styles'],
    parts: ['content'],
    visualStates: ['focused'],
    slots: { content: { cardinality: 'one', owner: 'caller', messages: 'bubble' } },
    reuse: { measurement: () => ['stable'] },
    measure: ({ slots }) => slots.measure('content'),
    layout: ({ bounds }) => ({ content: bounds }),
    accessibility: ({ id, children }) => ({ id, children }),
  };
}

function mutateDefinition(definition) {
  definition.states.splice(0, 1, 'busy');
  definition.metadata.length = 0;
  definition.parts[0] = 'replacement';
  definition.visualStates[0] = 'hovered';
  Object.assign(definition.slots.content, {
    cardinality: 'many', owner: 'implementation', messages: 'none',
  });
  definition.slots.extra = { cardinality: 'one', owner: 'caller', messages: 'none' };
  definition.reuse.measurement = () => { throw new Error('mutated selector'); };
  definition.layout = () => { throw new Error('mutated layout'); };
}

test('compiled phases retain only their hooks and owned capability snapshots', () => {
  const definition = mutableDefinition();
  const compiled = compileDefinition(definition);
  mutateDefinition(definition);
  for (const phase of [compiled.instance, compiled.renderer, compiled.slots]) {
    assert.equal(Object.isFrozen(phase), true);
    for (const field of ['states', 'metadata', 'parts', 'visualStates', 'slots']) {
      assert.equal(field in phase, false);
    }
  }
  assert.equal('createModel' in compiled.renderer, false);
  assert.equal('layout' in compiled.instance, false);
  assert.equal('accessibility' in compiled.slots, false);
  assert.deepEqual(compiled.contract.states, ['disabled']);
  assert.deepEqual(compiled.contract.metadata, ['layer', 'styles']);
  assert.deepEqual([...compiled.contract.partSet], ['content']);
  assert.deepEqual([...compiled.contract.visualStateSet], ['focused']);
  assert.deepEqual(compiled.contract.slots, [
    { name: 'content', cardinality: 'one', owner: 'caller', messages: 'bubble' },
  ]);
  assert.equal(Object.isFrozen(compiled.contract.slots[0]), true);
  assert.equal(Object.isFrozen(compiled.instance.reuse), true);
});

test('author mutation cannot change existing factory validation, rendering, or inspection', () => {
  const definition = mutableDefinition();
  const factory = defineComponent(definition);
  mutateDefinition(definition);
  const element = factory({
    id: 'snapshot', disabled: true,
    meta: { layer: { zIndex: 1 } },
    slots: { content: text({ content: 'owned' }) },
  });
  const inspection = inspectElement(element);
  assert.deepEqual(inspection.component.states, ['disabled']);
  assert.deepEqual(inspection.component.styleParts, ['content']);
  assert.deepEqual(inspection.component.visualStates, ['focused']);
  assert.doesNotThrow(() => renderElementFrame(element, { columns: 8, rows: 1 }));
  assert.throws(() => factory({ id: 'new-state', busy: true, slots: { content: text({ content: '' }) } }),
    /busy/u);
  assert.throws(() => factory({ id: 'new-slot', slots: { content: [text({ content: '' })] } }),
    /accepts one element/u);
});
