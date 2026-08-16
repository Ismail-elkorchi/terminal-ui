import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../../dist/components/index.js';
import { diffFrames, renderElementFrame } from '../../dist/renderer/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';

test('renderer frames within a transcript evidence budget remain replayable after retention', () => {
  let seed = 0x51f15e;
  for (let scenario = 0; scenario < 64; scenario += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const terminalSize = {
      columns: 4 + (seed % 28),
      rows: 2 + ((seed >>> 5) % 7)
    };
    const maxRetainedCells = terminalSize.columns * terminalSize.rows * 2;
    const recorder = createTranscriptRecorder({
      id: `property-${String(scenario)}`,
      retention: {
        maxSteps: 1 + (seed % 4),
        maxRetainedBytes: 2_000_000,
        maxRetainedCells,
        maxRetainedGraphics: 0
      }
    });
    let previous;
    for (let version = 0; version < 8; version += 1) {
      const frame = renderElementFrame(text({
        content: `${String(seed)}:${String(version)}:${'界🙂text'.repeat((seed + version) % 5)}`
      }), terminalSize);
      recorder.record({
        kind: 'commit',
        commit: {
          id: `property-${String(scenario)}:${String(version)}`,
          stateVersion: version,
          terminalSize,
          frame,
          diff: diffFrames(previous, frame)
        }
      });
      previous = frame;
    }

    const transcript = recorder.snapshot();
    const retainedCells = transcript.steps.reduce((total, step) =>
      total + (step.kind === 'commit' ? step.commit.frame.cells.length : 0), 0);
    assert.equal(retainedCells <= maxRetainedCells, true);
    const firstCommit = transcript.steps.find((step) => step.kind === 'commit');
    assert.equal(firstCommit?.commit.diff.fullRewrite, true);
    const validated = validateTranscript(transcript);
    assert.equal(validated.ok, true, validated.ok ? undefined : validated.error.message);
  }
});
