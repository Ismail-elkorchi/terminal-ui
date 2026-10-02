import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { rasterImage } from '../../../dist/graphics/index.js';
import { overlay } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { createMemoryTerminalHost, failedTerminalWrite } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

const picture = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 80]) });
const paint = defineComponent({
  name: 'terminal-ui-tests/retained-frame-equivalence',
  identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
  metadata: ['styles', 'layer'], retainPaint: true,
  createModel: options => options.model,
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 24, preferredHeight: 5 }),
  render({ model, target }) {
    for (const line of model.lines) target.write(line.row, line.column, [{
      text: line.text, style: { bold: model.bold, ...(model.bg === undefined ? {} : { bg: model.bg }) },
      source: { cellRole: 'content', itemId: model.source },
      link: { href: 'https://example.com/' + model.source },
    }]);
    if (model.clear) target.clear(model.clear);
    if (model.graphic) target.placeGraphic({ id: 'sample', image: picture,
      bounds: { row: 1, column: 3, width: 4, height: 2 }, fit: 'fill' });
  },
  hitTargets: ({ bounds }) => [{ id: 'activate', bounds, accepts: ['pointerDown'], message: () => ({ kind: 'activate' }) }],
  accessibility: ({ id, model }) => ({ id, role: 'text', label: model.source }),
});
const base = Object.freeze({ lines: [{ row: 0, column: 0, text: 'base 界 abc 👩🏽‍💻 tail' },
  { row: 1, column: 0, text: 'second background row' }, { row: 3, column: 0, text: 'bottom row' }], bold: false, source: 'base' });
const stable = Object.freeze({ lines: [{ row: 0, column: 2, text: '界W' }], bold: true, source: 'stable' });
function scene(model, iteration, config = {}) {
  const models = [base, ...(config.remove ? [] : [model]), stable];
  return overlay(models.map((entry, index) => paint({
    id: entry === base ? 'base' : entry === stable ? 'stable' : 'moving', model: entry,
    meta: { layer: { zIndex: config.sameLayer ? 1 : index + 1,
      ...(config.backdrop && entry === model ? { backdrop: 'viewport' } : {}) } },
    onAction: () => iteration,
  })), { id: 'scene' });
}

for (const sameLayer of [true, false]) {
  test(`retained frames equal fresh frames across overlaps and damage (same layer: ${sameLayer})`, () => {
    let previous;
    const history = [];
    for (let iteration = 0; iteration < 36; iteration++) {
      const model = Object.freeze({ lines: [{ row: iteration % 3, column: iteration % 7,
        text: ['short', '界界', '👨‍👩‍👧‍👦', 'x', ''][iteration % 5] }], bold: iteration % 2 === 0,
        source: `revision-${iteration}`,
        ...(iteration % 7 === 0 ? { clear: { row: 0, column: 3, width: 2, height: 2 } } : {}),
        graphic: iteration % 9 === 0,
      });
      const size = { columns: iteration % 4 === 0 ? 17 : 24, rows: iteration % 6 === 0 ? 4 : 5 };
      const view = scene(model, iteration, { sameLayer, remove: iteration % 8 === 0, backdrop: iteration % 11 === 0 });
      const options = { framePasses: [{ id: 'footer', apply(buffer) {
        buffer.write(size.rows, size.columns - 1, [{ text: String(iteration % 10), source: { cellRole: 'decoration' } }]);
      } }] };
      const retained = renderElementInternal(view, size, { previous, ...options });
      const fresh = renderElementInternal(view, size, options);
      assert.deepEqual(retained.frame, fresh.frame, `iteration ${iteration}`);
      for (const region of retained.regions) for (const target of region.hitTargets) {
        assert.equal(target.message({ kind: 'pointerDown' }), iteration, 'current interaction mappings');
      }
      for (const old of history) assert.deepEqual(old.frame, old.copy, 'older committed snapshots stay immutable');
      history.push({ frame: retained.frame, copy: structuredClone(retained.frame) });
      previous = retained;
    }
  });
}

test('a failed host write cannot mutate the committed retained frame', async () => {
  const app = defineTui({ id: 'retained-storage-commit', init: () => ({ state: { ...base, source: 'moving' } }),
    update: (_state, message) => ({ state: message }), view: state => scene(state, 1) });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 5 } });
  const write = host.write.bind(host);
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    const committed = runtime.frame();
    const before = structuredClone(committed);
    host.write = async () => failedTerminalWrite(host.id, new Error('injected write failure'));
    await assert.rejects(runtime.dispatch({ ...base, source: 'changed', lines: [{ row: 0, column: 0, text: 'replacement' }] }));
    assert.deepEqual(committed, before);
    assert.strictEqual(runtime.frame(), committed);
    host.write = write;
  } finally { await runtime.dispose(); }
});

for (const backdropCount of [1, 2]) {
  test(`fixed ${backdropCount} viewport backdrops retain fresh composition below changed cells`, () => {
    let previous;
    const oldFrames = [];
    for (let iteration = 0; iteration < 24; iteration++) {
      const underneath = Object.freeze({ ...base, source: `under-${iteration}`, bg: { kind: 'ansi', value: iteration % 8 },
        lines: [{ row: iteration % 3, column: iteration % 5, text: iteration % 2 ? 'a界' : 'changed' }] });
      const view = overlay([
        paint({ id: 'under', model: underneath, meta: { layer: { zIndex: 1 } }, onAction: () => iteration }),
        ...Array.from({ length: backdropCount }, (_, index) => paint({
          id: `backdrop-${index}`, model: stable,
          meta: { layer: { zIndex: index + 2, backdrop: 'viewport' } }, onAction: () => iteration,
        })),
      ], { id: 'fixed-backdrops' });
      const size = { columns: 24, rows: 5 };
      const next = renderElementInternal(view, size, { previous });
      const fresh = renderElementInternal(view, size);
      assert.deepEqual(next.frame, fresh.frame, `backdrops ${backdropCount}, iteration ${iteration}`);
      for (const old of oldFrames) assert.deepEqual(old.frame, old.copy);
      oldFrames.push({ frame: next.frame, copy: structuredClone(next.frame) });
      previous = next;
    }
  });
}
