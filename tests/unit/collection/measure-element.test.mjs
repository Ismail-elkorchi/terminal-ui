import assert from 'node:assert/strict';
import test from 'node:test';
import { flow, measureElement, measuredColumn, richText, text, viewport } from '../../../dist/index.js';
import { defineComponent } from '../../../dist/component/index.js';
import { layoutElement, renderElementFrame } from '../../../dist/renderer/index.js';
import { acceptMeasurements, createMeasuredCollection, createMeasurementState, measurementRequests, measuredWindow, updateMeasurementState } from '../../../dist/collection/index.js';

test('public preparation uses component measurement without rendering or layout effects', () => {
  const element = richText({ segments: [{ kind: 'text', text: 'word '.repeat(30) }], wrap: true });
  const wide = measureElement(element, { columns: 40, rows: 100 });
  const narrow = measureElement(element, { columns: 10, rows: 100 });
  assert.ok(narrow.preferredHeight > wide.preferredHeight);
  assert.deepEqual(measureElement(element, { columns: 40, rows: 100 }), wide);
  assert.throws(() => measureElement(element, { columns: -1, rows: 10 }));
});

test('prepared height-dependent items render with their measured constraints throughout resize', () => {
  const heightDependent = defineComponent({
    name: 'measurement-tests/height-dependent',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'text',
    createModel: () => ({}),
    measure: ({ constraints }) => ({ minWidth: 1, minHeight: 1,
      preferredWidth: 1, preferredHeight: constraints.height }),
    render: ({ target }) => target.write(0, 0, [{ text: 'Measured' }]),
    accessibility: ({ id }) => ({ id, role: 'text' }),
  });
  // The built-in vertical flow depends on the row constraint too.
  const entries = [heightDependent({ id: 'custom' }),
    flow(['a', 'b', 'c', 'd', 'e', 'f'].map(content => text({ content })), { direction: 'vertical' }),
    heightDependent({ id: 'tail' })];
  let state = createMeasurementState({
    collection: createMeasuredCollection(entries.map((value, index) => ({ id: String(index), rows: 1, value }))),
    geometry: { columns: 20, rows: 3, revision: 0 }, viewportRows: 4,
  });
  const settle = () => {
    for (let pass = 0; pass < entries.length && measurementRequests(state, 1).length > 0; pass += 1) {
      state = acceptMeasurements(state, measurementRequests(state, 1).map(request => ({
        request, rows: measureElement(request.value, request.geometry).preferredHeight,
      })));
    }
    assert.deepEqual(measurementRequests(state, 1), []);
  };
  const render = () => {
    const window = measuredWindow(state.collection, state);
    const element = viewport(measuredColumn(window, entry => entry.item.value, { measurementRows: state.geometry.rows }), {});
    const size = { columns: state.geometry.columns, rows: state.viewportRows };
    const layout = layoutElement(element, size);
    assert.deepEqual(layout.children[0].children.map(child => child.bounds.height), window.entries.map(entry => entry.item.rows));
    assert.doesNotThrow(() => renderElementFrame(element, size));
  };
  settle();
  render();
  const acceptedGeometry = state.geometry;
  state = updateMeasurementState(state, { ...state, viewportRows: 5 });
  assert.equal(state.geometry, acceptedGeometry);
  assert.deepEqual(measurementRequests(state), []);
  render();
  state = updateMeasurementState(state, { ...state, geometry: { ...state.geometry, rows: 5 } });
  assert.equal(measurementRequests(state).length, 2);
  settle();
  render();
  assert.equal(state.collection.totalRows, 13);
  const window = measuredWindow(state.collection, state);
  assert.throws(() => measuredColumn(window, entry => entry.item.value, { measurementRows: -1 }), RangeError);
});

test('width and text-profile changes remeasure wrapped content and reject earlier results', () => {
  const narrow = { emoji: 'wide', ambiguous: 'narrow' };
  const wide = { emoji: 'wide', ambiguous: 'wide' };
  const value = richText({ segments: [{ kind: 'text', text: '·'.repeat(32) }], wrap: true });
  let state = createMeasurementState({
    collection: createMeasuredCollection([{ id: 'wrapped', rows: 1, value }]),
    geometry: { columns: 8, rows: 10, revision: narrow }, viewportRows: 3,
  });
  const batch = () => measurementRequests(state).map(request => ({ request,
    rows: measureElement(request.value, request.geometry, { widthProfile: request.geometry.revision }).preferredHeight }));
  state = acceptMeasurements(state, batch());
  assert.equal(state.collection.totalRows, 4);
  state = updateMeasurementState(state, { ...state, geometry: { ...state.geometry, columns: 4 } });
  const oldWidthProfile = batch();
  assert.equal(oldWidthProfile[0].rows, 8);
  state = updateMeasurementState(state, { ...state, geometry: { ...state.geometry, revision: wide } });
  assert.equal(acceptMeasurements(state, oldWidthProfile), state);
  state = acceptMeasurements(state, batch());
  assert.equal(state.collection.totalRows, 16);
  assert.deepEqual(measurementRequests(state), []);
});
