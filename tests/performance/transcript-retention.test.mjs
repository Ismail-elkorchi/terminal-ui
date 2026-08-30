import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTranscriptRecorder,
  validateTranscript,
} from '../../dist/transcript/index.js';

test('high-volume transcript resource eviction preserves bounded valid output', () => {
  const recorder = createTranscriptRecorder({
    id: 'bounded-bookkeeping',
    retention: {
      maxSteps: 100_000,
      maxRetainedBytes: 4_096,
      maxRetainedJsonNodes: 1_000,
      maxRetainedStringCodeUnits: 4_096,
    },
  });
  const value = 'x'.repeat(256);
  for (let index = 0; index < 100_000; index += 1) {
    recorder.recordNormalizedMessage('external', { index, value });
  }

  const snapshot = recorder.snapshot();
  assert.equal(snapshot.steps.length < 100, true);
  assert.equal(snapshot.omittedSteps + snapshot.steps.length, 100_000);
  assert.equal(validateTranscript(snapshot).status, 'success');
});
