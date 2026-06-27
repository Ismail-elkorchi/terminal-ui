import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnostic } from '../../dist/diagnostics.js';
import { createTerminalHarness, replayTranscript } from '../../dist/testing/index.js';
import { redactTranscript, validateTranscript } from '../../dist/transcript/index.js';

test('transcript replay preserves frames, diffs, snapshots, diagnostics, and restore checkpoints', async () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const frame = {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 3,
    height: 1,
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    accessibility: snapshot
  };
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: 3,
    height: 1,
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] }]
  };
  const restore = {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    cursorVisible: true
  };

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'replay-all',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'x', paste: false } },
      { kind: 'frame', frame },
      { kind: 'diff', diff },
      { kind: 'snapshot', snapshot },
      {
        kind: 'diagnostic',
        diagnostic: {
          schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
          code: 'INPUT_CANCELLED',
          severity: 'info',
          message: 'cancelled'
        }
      },
      { kind: 'restore', checkpoint: restore }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(harness.frames()[0], frame);
  assert.equal(harness.diffs()[0], diff);
  assert.equal(harness.restores()[0], restore);
  assert.equal(result.snapshot.root.id, snapshot.root.id);
  assert.equal(result.snapshot.root.label, snapshot.root.label);
  assert.ok(result.transcript.steps.some((step) => step.kind === 'snapshot'));
  assert.ok(result.transcript.steps.some((step) => step.kind === 'diagnostic'));
});

test('transcript replay returns a typed diagnostic for invalid transcripts', async () => {
  const harness = createTerminalHarness();
  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: '',
    source: 'test',
    steps: [],
    diagnostics: [],
    redactions: []
  });

  assert.equal(result.transcript.diagnostics[0]?.code, 'TRANSCRIPT_REPLAY_FAILED');
});

test('transcript replay preserves top-level diagnostics and redaction metadata', async () => {
  const harness = createTerminalHarness();
  const diagnosticItem = diagnostic('INPUT_TIMEOUT', 'Timed out.', {
    target: 'prompt',
    data: { timeoutMs: 10 }
  });
  const stepDiagnostic = diagnostic('INPUT_CANCELLED', 'Cancelled.');

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'top-level-metadata',
    source: 'test',
    steps: [
      { kind: 'diagnostic', diagnostic: stepDiagnostic }
    ],
    diagnostics: [stepDiagnostic, diagnosticItem],
    redactions: [{ path: '$.steps[0].event.text', reason: 'secret' }]
  });

  assert.deepEqual(result.transcript.diagnostics.map((item) => item.code), [
    'INPUT_CANCELLED',
    'INPUT_TIMEOUT'
  ]);
  assert.equal(
    result.transcript.steps.filter((step) => step.kind === 'diagnostic' && step.diagnostic.code === 'INPUT_CANCELLED').length,
    1
  );
  assert.equal(
    result.transcript.steps.filter((step) => step.kind === 'diagnostic' && step.diagnostic.code === 'INPUT_TIMEOUT').length,
    1
  );
  assert.deepEqual(result.transcript.redactions, [{ path: '$.steps[0].event.text', reason: 'secret' }]);
});

test('transcript validation rejects under-shaped replay frames and diffs', () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const invalidFrame = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'invalid-frame',
    source: 'test',
    steps: [
      {
        kind: 'frame',
        frame: {
          width: 2,
          height: 1,
          cells: [],
          accessibility: snapshot
        }
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalidFrame.ok, false);
  assert.match(invalidFrame.error.message, /frame schemaVersion/u);

  const invalidDiff = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'invalid-diff',
    source: 'test',
    steps: [
      {
        kind: 'diff',
        diff: {
          schemaVersion: 'terminal-ui.render-diff.v1',
          width: 2,
          height: 1,
          fullRewrite: true,
          operations: [{ kind: 'write', row: 0, column: 1, spans: [{ text: 'x' }] }]
        }
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalidDiff.ok, false);
  assert.match(invalidDiff.error.message, /diff operation 0/u);
});

test('transcript redaction records concrete paths for redacted strings', () => {
  const redacted = redactTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'redaction',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'token=secret-value', paste: false } }
    ],
    diagnostics: [],
    redactions: []
  }, {
    secrets: ['secret-value']
  });

  assert.equal(JSON.stringify(redacted).includes('secret-value'), false);
  assert.deepEqual(redacted.redactions, [{ path: '$.steps[0].event.text', reason: 'secret' }]);
});

test('diagnostics normalize causes into JSON-safe transcript data', () => {
  const item = diagnostic('HOST_STREAM_CLOSED', 'Read failed.', {
    cause: new Error('socket closed')
  });
  const transcript = {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'diagnostic-cause',
    source: 'test',
    steps: [{ kind: 'diagnostic', diagnostic: item }],
    diagnostics: [item],
    redactions: []
  };
  const invalid = validateTranscript({
    ...transcript,
    diagnostics: [{ ...item, cause: Number.NaN }]
  });

  assert.deepEqual(item.cause, { name: 'Error', message: 'socket closed' });
  assert.equal(JSON.stringify(item).includes('stack'), false);
  assert.equal(validateTranscript(transcript).ok, true);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error.message, /diagnostic cause/u);
});

test('diagnostics redact obvious secret-bearing strings by default', () => {
  const item = diagnostic('HOST_STREAM_CLOSED', 'Failed with --token visible-token.', {
    cause: new Error('Process failed with API_KEY=visible-api-key and --password hunter2.'),
    hint: 'Set ACCESS_TOKEN=visible-access-token before retrying.',
    data: {
      nested: {
        message: 'credential=visible-credential'
      }
    }
  });
  const encoded = JSON.stringify(item);

  assert.equal(encoded.includes('visible-token'), false);
  assert.equal(encoded.includes('visible-api-key'), false);
  assert.equal(encoded.includes('hunter2'), false);
  assert.equal(encoded.includes('visible-access-token'), false);
  assert.equal(encoded.includes('visible-credential'), false);
  assert.match(encoded, /\[redacted\]/u);
  assert.equal(validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'redacted-diagnostic',
    source: 'test',
    steps: [{ kind: 'diagnostic', diagnostic: item }],
    diagnostics: [item],
    redactions: []
  }).ok, true);
});

test('transcript validation rejects unknown diagnostic codes', () => {
  const invalid = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'unknown-diagnostic',
    source: 'test',
    steps: [
      {
        kind: 'diagnostic',
        diagnostic: {
          schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
          code: 'UNKNOWN_DIAGNOSTIC',
          severity: 'error',
          message: 'unknown'
        }
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.error.message, /unsupported diagnostic code/u);
});
