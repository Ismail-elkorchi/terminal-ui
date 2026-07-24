import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticOccurrenceReporter, diagnostic } from '../../dist/diagnostics.js';
import { restoreTerminalState } from '../../dist/host/index.js';
import { createTerminalHarness, replayTranscript } from '../../dist/testing/index.js';
import { redactTranscript, validateTranscript } from '../../dist/transcript/index.js';

test('transcript replay preserves frames, diffs, snapshots, diagnostics, and restore outcomes', async () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const frame = {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 3,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    accessibility: snapshot
  };
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v2',
    width: 3,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] }]
  };
  const restore = {
    status: 'restored',
    reason: 'success',
    requested: terminalState(),
    attempted: [],
    confirmed: [],
    resultingState: terminalState(),
    diagnostics: []
  };

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'replay-all',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'x', paste: false } },
      { kind: 'commit', commit: runtimeCommit(frame, diff) },
      { kind: 'snapshot', snapshot },
      {
        kind: 'diagnostic',
        diagnostic: occurrence('replay-all', 1, diagnostic('INPUT_CANCELLED', 'cancelled', { severity: 'info' }))
      },
      { kind: 'restore', result: restore }
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

test('terminal harness transcripts represent nested lease restoration', async () => {
  const harness = createTerminalHarness();
  await harness.run(async (host) => {
    const outer = await host.beginSession({ id: 'outer' });
    await outer.enableAlternateScreen();
    const inner = await host.beginSession({ id: 'inner' });
    await inner.enableBracketedPaste();
    await restoreTerminalState(host);
  });
  const transcript = harness.transcript.snapshot();
  const restores = transcript.steps.filter((step) => step.kind === 'restore');
  const validation = validateTranscript(transcript);

  assert.equal(restores.length, 2);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

function terminalState() {
  return {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    keyboardProfile: { kind: 'legacy' },
    cursorVisible: true,
    provenance: {
      rawInput: 'observed',
      alternateScreen: 'assumed',
      bracketedPaste: 'assumed',
      mouseReporting: 'assumed',
      focusReporting: 'assumed',
      keyboardProfile: 'assumed',
      cursorVisible: 'assumed'
    }
  };
}

test('transcript replay returns a typed diagnostic for invalid transcripts', async () => {
  const harness = createTerminalHarness();
  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
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
  const report = createDiagnosticOccurrenceReporter('top-level-metadata');
  const diagnosticItem = report.report(diagnostic('INPUT_TIMEOUT', 'Timed out.', {
    target: 'prompt',
    data: { timeoutMs: 10 }
  }));
  const stepDiagnostic = report.report(diagnostic('INPUT_CANCELLED', 'Cancelled.'));

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
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

test('transcript recording is idempotent per occurrence and preserves equal occurrences', async () => {
  const source = createTerminalHarness();
  const item = diagnostic('INPUT_TIMEOUT', 'Timed out.', { target: 'field' });
  const first = source.transcript.reportDiagnostic(item);
  source.transcript.recordDiagnostic(first);
  const second = source.transcript.reportDiagnostic(item);
  const recorded = source.transcript.snapshot();

  assert.equal(recorded.diagnostics.length, 2);
  assert.equal(recorded.steps.filter((step) => step.kind === 'diagnostic').length, 2);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.id, second.id);

  const target = createTerminalHarness();
  const result = await replayTranscript(target, {
    ...recorded,
    diagnostics: [first, second, first]
  });
  assert.equal(result.transcript.diagnostics.length, 2);
  assert.equal(result.transcript.steps.filter((step) => step.kind === 'diagnostic').length, 2);
});

test('transcript replay preserves partial restoration without upgrading its outcome', async () => {
  const harness = createTerminalHarness();
  const partial = {
    status: 'partial',
    reason: 'error',
    requested: terminalState(),
    attempted: [{ kind: 'rawInput', enabled: false }],
    confirmed: [],
    resultingState: {
      ...terminalState(),
      rawInput: true,
      provenance: { ...terminalState().provenance, rawInput: 'indeterminate' }
    },
    diagnostics: [diagnostic('HOST_RESTORE_FAILED', 'Raw input restoration was not confirmed.')]
  };
  const transcript = {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'partial-restore',
    source: 'test',
    steps: [{ kind: 'restore', result: partial }],
    diagnostics: [],
    redactions: []
  };

  assert.equal(validateTranscript(transcript).ok, true);
  const result = await replayTranscript(harness, transcript);

  assert.equal(harness.restores()[0]?.status, 'partial');
  assert.equal(harness.restores()[0]?.resultingState.provenance.rawInput, 'indeterminate');
  assert.equal(result.transcript.steps.find((step) => step.kind === 'restore')?.result.status, 'partial');
});

test('transcript validation rejects duplicate, decreasing, and post-restore commits', () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const frame = validFrame(2, 1, snapshot);
  const diff = validDiff(2, 1);
  const commit = runtimeCommit(frame, diff);
  const base = {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'commit-order',
    source: 'test',
    diagnostics: [],
    redactions: []
  };
  const duplicate = validateTranscript({ ...base, steps: [
    { kind: 'commit', commit },
    { kind: 'commit', commit }
  ] });
  const decreasing = validateTranscript({ ...base, steps: [
    { kind: 'commit', commit: { ...commit, id: 'commit:2', stateVersion: 2 } },
    { kind: 'commit', commit: { ...commit, id: 'commit:3', stateVersion: 1 } }
  ] });
  const restored = {
    status: 'restored', reason: 'success', requested: terminalState(), attempted: [], confirmed: [],
    resultingState: terminalState(), diagnostics: []
  };
  const postRestore = validateTranscript({ ...base, steps: [
    { kind: 'restore', result: restored },
    { kind: 'commit', commit }
  ] });

  assert.match(duplicate.error.message, /duplicated/u);
  assert.match(decreasing.error.message, /decreases/u);
  assert.match(postRestore.error.message, /after restoration/u);
});

test('transcript validation rejects under-shaped replay frames and diffs', () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const invalidFrame = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'invalid-frame',
    source: 'test',
    steps: [
      {
        kind: 'commit',
        commit: runtimeCommit({
          width: 2,
          height: 1,
          widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
          cells: [],
          accessibility: snapshot
        }, validDiff(2, 1))
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalidFrame.ok, false);
  assert.match(invalidFrame.error.message, /frame schemaVersion/u);

  const invalidDiff = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'invalid-diff',
    source: 'test',
    steps: [
      {
        kind: 'commit',
        commit: runtimeCommit(validFrame(2, 1, snapshot), {
          schemaVersion: 'terminal-ui.render-diff.v2',
          width: 2,
          height: 1,
          widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
          fullRewrite: true,
          operations: [{ kind: 'write', row: 0, column: 1, spans: [{ text: 'x' }] }]
        })
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalidDiff.ok, false);
  assert.match(invalidDiff.error.message, /diff operation 0/u);
});

test('transcript validation rejects unknown frame-cell interaction states', () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const baseFrame = validFrame(2, 1, snapshot);
  const baseDiff = validDiff(2, 1);
  const base = {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'invalid-frame-source-state',
    source: 'test',
    diagnostics: [],
    redactions: []
  };
  const validateCommit = (frame, diff) => validateTranscript({
    ...base,
    steps: [{ kind: 'commit', commit: runtimeCommit(frame, diff) }]
  });

  const cell = validateCommit({
    ...baseFrame,
    cells: [{
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: { state: 'busy' }
    }]
  }, baseDiff);
  assert.equal(cell.ok, false);
  assert.match(cell.error.message, /frame cell 0.*state must be focused/u);

  const cursor = validateCommit({
    ...baseFrame,
    cursor: { row: 1, column: 1, source: { state: 'busy' } }
  }, baseDiff);
  assert.equal(cursor.ok, false);
  assert.match(cursor.error.message, /frame cursor source.*state must be focused/u);

  const span = validateCommit(baseFrame, {
    ...baseDiff,
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'x', source: { state: 'busy' } }]
    }]
  });
  assert.equal(span.ok, false);
  assert.match(span.error.message, /write span source.*state must be focused/u);

  const valid = validateCommit({
    ...baseFrame,
    cells: [{
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: { state: 'active' }
    }],
    cursor: { row: 1, column: 1, source: { state: 'selected' } }
  }, {
    ...baseDiff,
    cursor: { row: 1, column: 1, source: { state: 'selected' } },
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'x', source: { state: 'active' } }]
    }]
  });
  assert.equal(valid.ok, true, valid.ok ? undefined : valid.error.message);
});

test('transcript redaction records concrete paths for redacted strings', () => {
  const redacted = redactTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
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
  const reported = occurrence('diagnostic-cause', 1, item);
  const transcript = {
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'diagnostic-cause',
    source: 'test',
    steps: [{ kind: 'diagnostic', diagnostic: reported }],
    diagnostics: [reported],
    redactions: []
  };
  const invalid = validateTranscript({
    ...transcript,
    diagnostics: [{ ...reported, cause: Number.NaN }]
  });

  assert.deepEqual(item.cause, { name: 'Error', message: 'socket closed' });
  assert.equal(JSON.stringify(item).includes('column'), false);
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
  const reported = occurrence('redacted-diagnostic', 1, item);

  assert.equal(encoded.includes('visible-token'), false);
  assert.equal(encoded.includes('visible-api-key'), false);
  assert.equal(encoded.includes('hunter2'), false);
  assert.equal(encoded.includes('visible-access-token'), false);
  assert.equal(encoded.includes('visible-credential'), false);
  assert.match(encoded, /\[redacted\]/u);
  assert.equal(validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'redacted-diagnostic',
    source: 'test',
    steps: [{ kind: 'diagnostic', diagnostic: reported }],
    diagnostics: [reported],
    redactions: []
  }).ok, true);
});

test('transcript validation rejects unknown diagnostic codes', () => {
  const invalid = validateTranscript({
    schemaVersion: 'terminal-ui.interaction-transcript.v3',
    id: 'unknown-diagnostic',
    source: 'test',
    steps: [
      {
        kind: 'diagnostic',
        diagnostic: {
          schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
          fingerprint: 'diagnostic:unknown-content',
          id: 'diagnostic:unknown',
          owner: 'unknown-diagnostic',
          sequence: 1,
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

function runtimeCommit(frame, diff) {
  return {
    id: 'runtime:commit:1',
    stateVersion: 0,
    terminalSize: { columns: frame.width, rows: frame.height },
    frame,
    diff
  };
}

function occurrence(owner, sequence, item) {
  return {
    ...item,
    id: `${owner}:diagnostic:${String(sequence)}`,
    owner,
    sequence
  };
}

function validFrame(width, height, accessibility) {
  return {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width,
    height,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [],
    accessibility
  };
}

function validDiff(width, height) {
  return {
    schemaVersion: 'terminal-ui.render-diff.v2',
    width,
    height,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    fullRewrite: true,
    operations: []
  };
}
