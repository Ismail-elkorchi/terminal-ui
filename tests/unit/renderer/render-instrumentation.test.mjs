import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../../../dist/components/index.js';
import { defineComponent } from '../../../dist/component/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createFrameBuffer, diffFrames, renderDiffAnsi, renderElementFrame } from '../../../dist/renderer/index.js';
import { renderElementInternal, rerenderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { toRenderNode } from '../../../dist/renderer/internal/render-tree/element.js';
import { createRenderMeasurementContext } from '../../../dist/renderer/internal/render-node-behavior.js';
import { createRenderBudget } from '../../../dist/renderer/render-budget.js';
import { defaultTheme } from '../../../dist/theme/index.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

function collector() {
  const stages = [];
  const work = new Map();
  return {
    stages,
    work,
    instrumentation: {
      now: () => 1,
      record: (sample) => { stages.push(sample); },
      recordWork: (sample) => { work.set(sample.kind, (work.get(sample.kind) ?? 0) + sample.count); }
    }
  };
}

test('render instrumentation records actual hooks, retained cells and stages', () => {
  const collected = collector();
  const frame = renderElementFrame(text({ content: 'measured' }), { columns: 20, rows: 3 }, {
    instrumentation: collected.instrumentation
  });
  assert.equal(frame.width, 20);
  assert.deepEqual(collected.stages.map((sample) => sample.stage), [
    'resolve_element', 'layout', 'focus', 'regions', 'composition',
    'frame_passes', 'cursor', 'hit_targets', 'accessibility', 'snapshot'
  ]);
  assert.equal(collected.work.get('layout_nodes'), 1);
  assert.equal(collected.work.get('render_hooks'), 1);
  assert.equal(collected.work.get('snapshot_cells'), frame.cells.length);
  assert.equal(collected.work.get('cell_transfer_calls'), frame.cells.length);
  assert.equal(collected.work.get('region_allocations'), 1);
});

test('measurement calls and misses follow independent custom hooks and retained cache', () => {
  let hooks = 0;
  const leaf = defineComponent({
    name: 'terminal-ui-tests/instrumented-measure',
    reuse: { measurement: () => [] },
    identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
    measure() { hooks += 1; return { minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1 }; },
    render() {},
    accessibility: ({ id }) => ({ id, role: 'text', label: id })
  });
  const node = toRenderNode(leaf({ id: 'measured' }));
  const collected = collector();
  const context = createRenderMeasurementContext(defaultTheme, defaultTextWidthProfile, createRenderBudget(), collected.instrumentation);
  const bounds = { row: 1, column: 1, width: 10, height: 2 };
  context.measure(node, bounds);
  context.measure(node, bounds);
  context.measure(node, { ...bounds, width: 8 });
  assert.equal(hooks, 2);
  assert.equal(collected.work.get('measurement_calls'), 3);
  assert.equal(collected.work.get('measurement_misses'), hooks);

  const retained = collector();
  createRenderMeasurementContext(defaultTheme, defaultTextWidthProfile, createRenderBudget(), retained.instrumentation).measure(node, bounds);
  assert.equal(hooks, 2);
  assert.equal(retained.work.get('measurement_calls'), 1);
  assert.equal(retained.work.get('measurement_misses') ?? 0, 0);
});

test('retained repaint counts render hooks without claiming layout or measurement', () => {
  let hooks = 0;
  const leaf = defineComponent({
    name: 'terminal-ui-tests/instrumented-repaint',
    identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
    measure: () => ({ minWidth: 3, minHeight: 1, preferredWidth: 3, preferredHeight: 1 }),
    render({ target }) { hooks += 1; target.write(0, 0, [{ text: 'abc' }]); },
    accessibility: ({ id }) => ({ id, role: 'text', label: id })
  });
  const initial = renderElementInternal(leaf({ id: 'painted' }), { columns: 10, rows: 2 });
  const collected = collector();
  const repaint = rerenderElementInternal(initial, { instrumentation: collected.instrumentation });
  assert.equal(hooks, 2);
  assert.equal(collected.work.get('render_hooks'), 1);
  assert.equal(collected.work.get('layout_nodes') ?? 0, 0);
  assert.equal(collected.work.get('measurement_calls') ?? 0, 0);
  assert.equal(collected.work.get('snapshot_cells'), 0);
  assert.deepEqual(repaint.frame.cells, initial.frame.cells);
  assert.equal(repaint.frame.cells.length, 3);
});

test('failed render candidates still report invoked hooks', () => {
  const leaf = defineComponent({
    name: 'terminal-ui-tests/instrumented-failure',
    identity: 'required', structure: 'leaf', semantics: 'semantic', accessibleRole: 'text',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render() { throw new Error('candidate failed'); },
    accessibility: ({ id }) => ({ id, role: 'text', label: id })
  });
  const collected = collector();
  assert.throws(() => renderElementFrame(leaf({ id: 'failure' }), { columns: 10, rows: 2 }, {
    instrumentation: collected.instrumentation
  }), /candidate failed/u);
  assert.equal(collected.work.get('render_hooks'), 1);
  assert.equal(collected.work.get('snapshot_cells') ?? 0, 0);
});

test('runtime work counts distinguish retained redraws from changed paint', async () => {
  const app = defineTui({
    id: 'instrumented-runtime',
    init: () => ({ state: 0 }),
    update: (state) => ({ state: state + 1 }),
    view: (state) => text({ content: `state ${String(state)}` })
  });
  const host = createMemoryTerminalHost();
  const collected = collector();
  const runtime = createTuiRuntime({ app, host, instrumentation: collected.instrumentation });
  try {
    await runtime.start();
    collected.work.clear();
    await runtime.redraw();
    assert.equal(collected.work.get('render_hooks') ?? 0, 0);
    assert.equal(collected.work.get('snapshot_cells'), 0);
    assert.ok(collected.work.has('diff_operations'));
    assert.ok(collected.work.has('encoded_bytes'));
    collected.work.clear();
    await runtime.dispatch({ kind: 'increment' });
    assert.equal(collected.work.get('render_hooks'), 1);
    assert.ok(collected.work.get('snapshot_cells') > 0);
    assert.ok(collected.work.get('encoded_bytes') > 0);
  } finally {
    await runtime.dispose();
    await host.dispose();
  }
});

test('diff and serialization distinguish comparisons, terminal cells and bytes', async () => {
  const frame = renderElementFrame(text({ content: 'measured' }), { columns: 20, rows: 3 });
  const collected = collector();
  const diff = diffFrames(undefined, frame, { instrumentation: collected.instrumentation });
  const host = createMemoryTerminalHost();
  const output = renderDiffAnsi(diff, { capabilities: await host.getCapabilities(), instrumentation: collected.instrumentation });
  await host.dispose();
  assert.equal(collected.work.get('diff_rows'), 0);
  assert.equal(collected.work.get('cell_comparisons'), 0);
  assert.equal(collected.work.get('diff_operations'), diff.operations.length);
  assert.ok(collected.work.get('diff_output_cells') >= frame.cells.length);
  assert.equal(collected.work.get('encoded_bytes'), new TextEncoder().encode(output).byteLength);

  const sparse = collector();
  const sameDiff = diffFrames(frame, frame, { instrumentation: sparse.instrumentation });
  assert.equal(sameDiff.operations.length, 0);
  assert.equal(sparse.work.get('diff_output_cells'), 0);
  assert.ok(sparse.work.get('cell_comparisons') <= frame.width * frame.height * 2);
});

test('sparse diff reports one terminal cell rather than the retained frame size', () => {
  const previousBuffer = createFrameBuffer(20, 3);
  previousBuffer.write(1, 1, [{ text: 'A' }]);
  const nextBuffer = createFrameBuffer(20, 3);
  nextBuffer.write(1, 1, [{ text: 'B' }]);
  const collected = collector();
  const diff = diffFrames(previousBuffer.snapshot(), nextBuffer.snapshot(), { instrumentation: collected.instrumentation });
  assert.equal(diff.fullRewrite, false);
  assert.equal(collected.work.get('diff_output_cells'), 1);
  assert.equal(collected.work.get('cell_comparisons'), 60);
});

test('buffer segmentation and frame index construction count executions', () => {
  const collected = collector();
  const buffer = createFrameBuffer(400, 2, { instrumentation: collected.instrumentation });
  const longText = 'q'.repeat(300);
  buffer.write(1, 1, [{ text: longText }]);
  buffer.write(2, 1, [{ text: longText }]);
  assert.equal(collected.work.get('buffer_segmentations'), 2);
  assert.equal(collected.work.get('buffer_segmented_code_units'), 600);

  const before = buffer.snapshot();
  const after = buffer.snapshot();
  collected.work.clear();
  diffFrames(before, after, { instrumentation: collected.instrumentation });
  assert.equal(collected.work.get('frame_index_builds'), 2);
  collected.work.clear();
  diffFrames(before, after, { instrumentation: collected.instrumentation });
  assert.equal(collected.work.get('frame_index_builds') ?? 0, 0);
});
