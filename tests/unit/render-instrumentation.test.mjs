import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { diffFrames, renderDiffAnsi, renderElementFrame } from '../../dist/renderer/index.js';

test('render instrumentation records each stage only when requested', () => {
  const samples = [];
  const work = [];
  let tick = 0;
  const frame = renderElementFrame(text({ content: 'measured' }), { columns: 20, rows: 3 }, {
    instrumentation: {
      now: () => tick++,
      record: (sample) => { samples.push(sample); },
      recordWork: (sample) => { work.push(sample); }
    }
  });

  assert.equal(frame.width, 20);
  assert.deepEqual(samples.map((sample) => sample.stage), [
    'resolve_element',
    'layout',
    'focus',
    'regions',
    'composition',
    'frame_passes',
    'cursor',
    'hit_targets',
    'accessibility',
    'snapshot'
  ]);
  assert.equal(samples.every((sample) => sample.durationMs === 1), true);
  assert.deepEqual(Object.fromEntries(work.map((sample) => [sample.kind, sample.count])), {
    render_nodes: 1,
    measured_nodes: 1,
    rendered_nodes: 1,
    hit_target_candidates: 0,
    composed_cells: 8,
    snapshot_rows: 3,
    snapshot_cells: 60,
    emitted_cells: 60
  });
});

test('diff and serialization instrumentation record structural work', async () => {
  const work = [];
  const frame = renderElementFrame(text({ content: 'measured' }), { columns: 20, rows: 3 });
  const instrumentation = { recordWork: (sample) => { work.push(sample); } };
  const diff = diffFrames(undefined, frame, { instrumentation });
  const host = createMemoryTerminalHost();
  const output = renderDiffAnsi(diff, { capabilities: await host.getCapabilities(), instrumentation });
  await host.dispose();

  const counts = Object.fromEntries(work.map((sample) => [sample.kind, sample.count]));
  assert.equal(counts.diff_rows, 3);
  assert.equal(counts.diff_cells, 60);
  assert.equal(counts.diff_operations, diff.operations.length);
  assert.equal(counts.encoded_bytes, new TextEncoder().encode(output).byteLength);
});
