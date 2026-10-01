import assert from 'node:assert/strict';
import test from 'node:test';
import { text } from '../../../dist/components/index.js';
import {
  column, flow, grid, measuredViewport, row, splitPane, surface, viewport,
} from '../../../dist/layout/index.js';
import { layoutElement } from '../../../dist/renderer/index.js';

const child = () => text({ content: 'content' });
const flowFactories = {
  column: (options) => column([child()], options),
  row: (options) => row([child()], options),
  grid: (options) => grid([child()], { rows: [{ kind: 'fill' }], columns: [{ kind: 'fill' }], ...options }),
  namedGrid: (options) => grid({ areas: 'body', children: { body: child() }, rows: [{ kind: 'fill' }], columns: [{ kind: 'fill' }], ...options }),
  surface: (options) => surface(child(), options),
  viewport: (options) => viewport(child(), options),
  measuredViewport: (options) => measuredViewport([child()], { id: 'window', onScroll: () => 'scroll', ...options }),
  splitPane: (options) => splitPane([child()], { direction: 'horizontal', ...options }),
};

for (const [name, create] of Object.entries(flowFactories)) {
  test(`${name} validates shared geometry when its element is constructed`, () => {
    for (const options of [
      { padding: -1 }, { padding: { left: Number.NaN } }, { margin: 0.5 },
      { minWidth: 20, maxWidth: 2 }, { minHeight: 2, maxHeight: 1 },
      { maxWidth: Number.POSITIVE_INFINITY }, { align: 'diagonal' }, { overflow: 'hidden' },
      ...(name === 'surface' ? [] : [{ gap: Number.NaN }]),
    ]) assert.throws(() => create(options), { name: /^(?:Type|Range)Error$/u });
  });

  test(`${name} owns retained inset geometry`, () => {
    const padding = { left: 1 };
    const margin = { top: 1 };
    const element = create({ padding, margin });
    const before = layoutElement(element, { columns: 12, rows: 5 });
    padding.left = 8;
    margin.top = 4;
    assert.deepEqual(layoutElement(element, { columns: 12, rows: 5 }), before);
  });
}

const trackFactories = {
  column: (sizes) => column([child()], { sizes }),
  row: (sizes) => row([child()], { sizes }),
  gridRows: (sizes) => grid([child()], { rows: sizes, columns: [{ kind: 'fill' }] }),
  gridColumns: (sizes) => grid([child()], { rows: [{ kind: 'fill' }], columns: sizes }),
  splitPane: (sizes) => splitPane([child()], { direction: 'horizontal', sizes }),
};
for (const [name, create] of Object.entries(trackFactories)) {
  test(`${name} owns and validates size tracks`, () => {
    const sizes = [{ kind: 'fixed', cells: 2 }];
    const element = create(sizes);
    const before = layoutElement(element, { columns: 12, rows: 5 });
    sizes[0].cells = 8;
    sizes.push({ kind: 'fill' });
    assert.deepEqual(layoutElement(element, { columns: 12, rows: 5 }), before);
    for (const track of [
      { kind: 'unknown' }, { kind: 'fixed', cells: Number.NaN },
      { kind: 'fixed', cells: -1 }, { kind: 'fixed', cells: 0.5 },
      { kind: 'percent', value: Number.POSITIVE_INFINITY }, { kind: 'percent', value: -1 },
      { kind: 'percent', value: 101 }, { kind: 'fill', weight: 0 },
      { kind: 'fill', weight: 0.5 }, { kind: 'content', min: 3, max: 2 },
    ]) assert.throws(() => create([track]), { name: /^(?:Type|Range)Error$/u });
    assert.throws(() => create(Array(1)), /track must be an object/u);
  });
}

test('flow and grid gaps have the same cell-count contract as shared geometry', () => {
  assert.throws(() => flow([child()], { direction: 'horizontal', gap: 0.5 }), /safe integer/u);
  assert.throws(() => flow([child()], { direction: 'horizontal', lineGap: -1 }), /safe integer/u);
  for (const field of ['rowGap', 'columnGap']) {
    assert.throws(() => flowFactories.grid({ [field]: Number.NaN }), /safe integer/u);
    assert.throws(() => flowFactories.namedGrid({ [field]: -1 }), /safe integer/u);
  }
});
