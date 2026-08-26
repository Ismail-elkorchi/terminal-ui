import assert from 'node:assert/strict';
import test from 'node:test';

import { button, image, text } from '../../dist/components/index.js';
import { rasterImage } from '../../dist/graphics/index.js';
import { column, overlay, row } from '../../dist/layout/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import {
  componentElement as component,
  compositeComponentDefinition,
} from '../helpers/component-definition.mjs';

const size = { columns: 20, rows: 6 };

test('render traversal stops broad and deep trees at the configured boundary', () => {
  assert.throws(
    () => renderElementFrame(row([
      text({ content: 'one' }),
      text({ content: 'two' }),
    ]), size, { limits: { nodes: 2 } }),
    /nodes limit of 2/u,
  );

  assert.throws(
    () => renderElementFrame(column([
      column([text({ content: 'nested' })]),
    ]), size, { limits: { depth: 1 } }),
    /depth limit of 1/u,
  );
});

test('render measurement and region work are bounded where they are produced', () => {
  assert.throws(
    () => renderElementFrame(row([
      text({ content: 'one' }),
      text({ content: 'two' }),
    ], { sizes: [{ kind: 'content' }, { kind: 'content' }] }), size, {
      limits: { measurements: 1 },
    }),
    /measurements limit of 1/u,
  );

  assert.throws(
    () => renderElementFrame(overlay([
      text({ content: 'base' }),
      text({ content: 'raised', meta: { layer: { zIndex: 1 } } }),
    ]), size, { limits: { regions: 1 } }),
    /regions limit of 1/u,
  );
});

test('published hit targets and accessibility trees share the render budget', () => {
  assert.throws(
    () => renderElementFrame(row([
      button({ id: 'one', label: 'One', onPress: () => 'one' }),
      button({ id: 'two', label: 'Two', onPress: () => 'two' }),
    ]), size, { limits: { hitTargets: 1 } }),
    /hitTargets limit of 1/u,
  );

  assert.throws(
    () => renderElementFrame(row([
      text({ id: 'one', content: 'one' }),
      text({ id: 'two', content: 'two' }),
    ]), size, { limits: { accessibilityNodes: 2 } }),
    /accessibilityNodes limit of 2/u,
  );

  const described = component({
    id: 'described',
    children: [
      text({ id: 'first-description', content: 'First' }),
      text({ id: 'second-description', content: 'Second' }),
    ],
    definition: {
      ...compositeComponentDefinition,
      accessibleRole: 'group',
      layout: ({ bounds }) => [bounds, bounds],
      accessibility: ({ id, children }) => ({
        id,
        role: 'group',
        describedBy: ['first-description', 'second-description'],
        children,
      }),
    },
  });
  assert.throws(
    () => renderElementFrame(described, size, { limits: { accessibilityRelationships: 1 } }),
    /accessibilityRelationships limit of 1/u,
  );

  const verbose = component({
    id: 'verbose',
    definition: {
      ...compositeComponentDefinition,
      accessibleRole: 'group',
      accessibility: ({ id }) => ({ id, role: 'group', description: 'x'.repeat(100) }),
    },
  });
  assert.throws(
    () => renderElementFrame(verbose, size, { limits: { accessibilityStringCodeUnits: 50 } }),
    /accessibilityStringCodeUnits limit of 50/u,
  );
});

test('graphics placements fall back atomically before frame retention', () => {
  const resource = rasterImage({
    width: 1,
    height: 1,
    format: 'rgb8',
    data: new Uint8Array([255, 255, 255]),
  });
  const frame = renderElementFrame(row([
      image({
        id: 'one',
        image: resource,
        label: 'One',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      }),
      image({
        id: 'two',
        image: resource,
        label: 'Two',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      }),
    ]), size, { graphicsBudget: { placementsPerFrame: 1 } });
  assert.equal(frame.graphics.length, 0);
  assert.equal(frame.accessibility.diagnostics[0]?.code, 'TUI_GRAPHICS_LIMIT_EXCEEDED');
});

test('budget limits validate their public input', () => {
  assert.throws(
    () => renderElementFrame(text({ content: 'x' }), size, { limits: { nodes: 0 } }),
    /nodes must be a positive safe integer/u,
  );
  assert.throws(
    () => renderElementFrame(text({ content: 'x' }), size, { limits: [] }),
    /limits must be an object/u,
  );
  assert.throws(
    () => renderElementFrame(text({ content: 'x' }), size, { limits: { nodez: 1 } }),
    /contains unsupported field: nodez/u,
  );
});
