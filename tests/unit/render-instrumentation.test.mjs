import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../../dist/components/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';

test('render instrumentation records each projection stage only when requested', () => {
  const samples = [];
  let tick = 0;
  const frame = renderElementFrame(text('measured'), { columns: 20, rows: 3 }, {
    instrumentation: {
      now: () => tick++,
      record: (sample) => { samples.push(sample); }
    }
  });

  assert.equal(frame.width, 20);
  assert.deepEqual(samples.map((sample) => sample.stage), [
    'normalize',
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
});
