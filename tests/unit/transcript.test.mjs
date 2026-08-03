import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticOccurrenceReporter, diagnostic } from '../../dist/diagnostics.js';
import { restoreTerminalState } from '../../dist/host/index.js';
import { createTerminalHarness, replayTranscript } from '../../dist/testing/index.js';
import { createTranscriptRecorder, redactTranscript, validateTranscript } from '../../dist/transcript/index.js';
import { createFrameBuffer } from '../../dist/renderer/index.js';

test('transcript replay preserves frames, diffs, snapshots, diagnostics, and restore outcomes', async () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const frame = {
    width: 3,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    accessibility: snapshot
  };
  const diff = {
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
    formatVersion: 2,
    id: 'replay-all',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'x', paste: false } },
      { kind: 'commit', commit: runtimeCommit(frame, diff) },
      { kind: 'snapshot', snapshot },
      {
        kind: 'diagnostic',
        occurrence: occurrence('replay-all', 1, diagnostic('INPUT_CANCELLED', 'cancelled', { severity: 'info' }))
      },
      { kind: 'restore', phase: 'shutdown', result: restore }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.deepEqual(harness.frames()[0], frame);
  assert.deepEqual(harness.diffs()[0], diff);
  assert.deepEqual(harness.restores()[0], restore);
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

test('recorded messages remain valid after JSON serialization', () => {
  const recorder = createTranscriptRecorder({ id: 'json-messages', source: 'tui' });
  const message = { command: 'open', arguments: [1, true, null] };
  recorder.record({
    kind: 'message',
    source: 'external',
    fidelity: 'exact',
    message
  });
  message.command = 'mutated';

  const parsed = JSON.parse(JSON.stringify(recorder.snapshot()));
  const validation = validateTranscript(parsed);

  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
  assert.deepEqual(parsed.steps[0].message, { command: 'open', arguments: [1, true, null] });
  assert.throws(
    () => recorder.record({
      kind: 'message',
      source: 'external',
      fidelity: 'exact',
      message: () => undefined
    }),
    /JSON-safe/u
  );
  recorder.recordNormalizedMessage('external', () => undefined);
  assert.equal(recorder.snapshot().steps.at(-1)?.message, '[object Function]');

  let deeplyNested = { value: null };
  for (let depth = 0; depth < 20_000; depth += 1) deeplyNested = { next: deeplyNested };
  recorder.recordNormalizedMessage('external', deeplyNested);
  assert.equal(validateTranscript(recorder.snapshot()).ok, true);

  const oversizedString = 'x'.repeat(1_000_001);
  recorder.recordNormalizedMessage('external', {
    value: oversizedString,
    [oversizedString]: true
  });
  const normalized = recorder.snapshot().steps.at(-1)?.message;
  assert.equal(normalized.value.endsWith('[Truncated]'), true);
  assert.equal(Object.keys(normalized)[1]?.endsWith('[Truncated]'), true);
  assert.equal(validateTranscript(recorder.snapshot()).ok, true);
});

test('arbitrary message normalization stops reading when its node budget is exhausted', () => {
  let reads = 0;
  const sparse = new Proxy(new Array(1_000_000), {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key)) reads += 1;
      return Reflect.get(target, key, receiver);
    }
  });
  const recorder = createTranscriptRecorder({ id: 'bounded-message', source: 'tui' });

  recorder.recordNormalizedMessage('external', sparse);

  const step = recorder.snapshot().steps[0];
  assert.equal(step.kind, 'message');
  assert.ok(reads <= 100_000, `read ${String(reads)} array entries beyond the node budget`);
  assert.ok(step.message.length <= 100_000);
  assert.equal(step.message.at(-1), '[Truncated]');
});

test('transcript commits exclude renderer optimization metadata', () => {
  const frame = createFrameBuffer(1, 1).snapshot();
  const diff = {
    width: 1,
    height: 1,
    widthProfile: frame.widthProfile,
    operations: [],
    fullRewrite: true
  };
  const recorder = createTranscriptRecorder({ id: 'public-frame-contract', source: 'tui' });
  recorder.record({
    kind: 'commit',
    commit: runtimeCommit(frame, diff)
  });

  const transcript = recorder.snapshot();
  const recorded = transcript.steps[0];

  assert.equal('metadata' in frame, true);
  assert.equal(recorded.kind, 'commit');
  assert.equal('metadata' in recorded.commit.frame, false);
  assert.equal(recorded.commit.frame.cells, frame.cells);
  assert.equal(recorded.commit.frame.accessibility, frame.accessibility);
  assert.equal(recorded.commit.diff, diff);
  assert.equal(validateTranscript(transcript).ok, true);
});

test('transcript replay is isolated from mutations after validation', async () => {
  const harness = createTerminalHarness();
  const recorder = createTranscriptRecorder({ id: 'detached-replay', source: 'replay' });
  const received = [];
  let releaseFirst;
  let reportFirst;
  const firstReceived = new Promise((resolve) => {
    reportFirst = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const target = {
    transcript: recorder,
    async input(event) {
      received.push(event);
      if (received.length === 1) {
        reportFirst();
        await firstGate;
      }
    },
    snapshot: () => harness.snapshot(),
    output: () => '',
    recordCommit() {},
    recordRestore() {}
  };
  const source = {
    formatVersion: 2,
    id: 'mutable-source',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'first', paste: false } },
      { kind: 'input', event: { kind: 'focus', focused: true } }
    ],
    diagnostics: [],
    redactions: []
  };

  const replay = replayTranscript(target, source);
  await firstReceived;
  source.steps[1].event = { kind: 'mouse', action: 'wheel' };
  releaseFirst();
  await replay;

  assert.deepEqual(received[1], { kind: 'focus', focused: true });
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
    formatVersion: 2,
    id: '',
    source: 'test',
    steps: [],
    diagnostics: [],
    redactions: []
  });

  assert.equal(result.transcript.diagnostics[0]?.diagnostic.code, 'TRANSCRIPT_REPLAY_FAILED');
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
    formatVersion: 2,
    id: 'top-level-metadata',
    source: 'test',
    steps: [
      { kind: 'diagnostic', occurrence: stepDiagnostic }
    ],
    diagnostics: [stepDiagnostic, diagnosticItem],
    redactions: [{ path: '$.steps[0].event.text', reason: 'secret' }]
  });

  assert.deepEqual(result.transcript.diagnostics.map((item) => item.diagnostic.code), [
    'INPUT_CANCELLED',
    'INPUT_TIMEOUT'
  ]);
  assert.equal(
    result.transcript.steps.filter((step) => step.kind === 'diagnostic' && step.occurrence.diagnostic.code === 'INPUT_CANCELLED').length,
    1
  );
  assert.equal(
    result.transcript.steps.filter((step) => step.kind === 'diagnostic' && step.occurrence.diagnostic.code === 'INPUT_TIMEOUT').length,
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
  assert.equal(first.diagnostic.fingerprint, second.diagnostic.fingerprint);
  assert.notEqual(first.id, second.id);

  const target = createTerminalHarness();
  const result = await replayTranscript(target, recorded);
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
    formatVersion: 2,
    id: 'partial-restore',
    source: 'test',
    steps: [{ kind: 'restore', phase: 'shutdown', result: partial }],
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
    formatVersion: 2,
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
    { kind: 'restore', phase: 'shutdown', result: restored },
    { kind: 'commit', commit }
  ] });

  assert.match(duplicate.error.message, /duplicated/u);
  assert.match(decreasing.error.message, /decreases/u);
  assert.match(postRestore.error.message, /after shutdown restoration/u);
});

test('transcript validation rejects under-shaped replay frames and diffs', () => {
  const harness = createTerminalHarness();
  const snapshot = harness.snapshot();
  const invalidFrame = validateTranscript({
    formatVersion: 2,
    id: 'invalid-frame',
    source: 'test',
    steps: [
      {
        kind: 'commit',
        commit: runtimeCommit({
          width: 2,
          height: 1,
          widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
          cells: null,
          accessibility: snapshot
        }, validDiff(2, 1))
      }
    ],
    diagnostics: [],
    redactions: []
  });

  assert.equal(invalidFrame.ok, false);
  assert.match(invalidFrame.error.message, /frame cells must be an array/u);

  const invalidDiff = validateTranscript({
    formatVersion: 2,
    id: 'invalid-diff',
    source: 'test',
    steps: [
      {
        kind: 'commit',
        commit: runtimeCommit(validFrame(2, 1, snapshot), {
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
    formatVersion: 2,
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
      source: { interactionState: 'busy' }
    }]
  }, baseDiff);
  assert.equal(cell.ok, false);
  assert.match(cell.error.message, /frame cell 0.*interactionState must be focused/u);

  const cursor = validateCommit({
    ...baseFrame,
    cursor: { row: 1, column: 1, source: { interactionState: 'busy' } }
  }, baseDiff);
  assert.equal(cursor.ok, false);
  assert.match(cursor.error.message, /frame cursor source.*interactionState must be focused/u);

  const span = validateCommit(baseFrame, {
    ...baseDiff,
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'x', source: { interactionState: 'busy' } }]
    }]
  });
  assert.equal(span.ok, false);
  assert.match(span.error.message, /write span source.*interactionState must be focused/u);

  const valid = validateCommit({
    ...baseFrame,
    cells: [{
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: { interactionState: 'active' }
    }],
    cursor: { row: 1, column: 1, source: { interactionState: 'selected' } }
  }, {
    ...baseDiff,
    cursor: { row: 1, column: 1, source: { interactionState: 'selected' } },
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'x', source: { interactionState: 'active' } }]
    }]
  });
  assert.equal(valid.ok, true, valid.ok ? undefined : valid.error.message);
});

test('transcript redaction records concrete paths for redacted strings', () => {
  const redacted = redactTranscript({
    formatVersion: 2,
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

test('transcript redaction covers signal payloads and existing audit paths', () => {
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'signal-redaction',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'signal', signal: 'private-marker' } }
    ],
    diagnostics: [],
    redactions: [{ path: '$["private-marker"]', reason: 'secret' }]
  }, {
    secrets: ['private-marker']
  });

  assert.equal(redacted.steps[0]?.event.signal, '[redacted]');
  assert.deepEqual(redacted.redactions, [
    { path: '$["[redacted]"]', reason: 'secret' },
    { path: '$.steps[0].event.signal', reason: 'secret' }
  ]);
  assert.equal(JSON.stringify(redacted).includes('private-marker'), false);
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction derives a safe effective replacement', () => {
  const transcript = {
    formatVersion: 2,
    id: 'safe-replacement',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: '[redacted]', paste: false } }
    ],
    diagnostics: [],
    redactions: []
  };
  const redacted = redactTranscript(transcript, { secrets: ['[redacted]'] });

  assert.equal(redacted.steps[0]?.event.text, '[removed]');
  assert.deepEqual(redacted.redactions, [
    { path: '$.steps[0].event.text', reason: 'secret' }
  ]);
  assert.equal(validateTranscript(redacted).ok, true);
  assert.throws(
    () => redactTranscript(transcript, {
      secrets: ['private-marker'],
      replacement: '\u001B[31m'
    }),
    /control characters or terminal sequences/u
  );
  assert.throws(
    () => redactTranscript(transcript, {
      secrets: ['private-marker'],
      replacement: 'private-marker replacement'
    }),
    /must not contain a configured secret/u
  );
});

test('transcript redaction handles message arrays at the transcript node limit', () => {
  const transcript = {
    formatVersion: 2,
    id: 'large-redaction',
    source: 'test',
    steps: [{
      kind: 'message',
      source: 'external',
      fidelity: 'exact',
      message: Array.from({ length: 200_000 }, () => null)
    }],
    diagnostics: [],
    redactions: []
  };

  assert.equal(validateTranscript(transcript).ok, true);
  const redacted = redactTranscript(transcript, { secrets: ['private-marker'] });
  assert.equal(redacted.steps[0]?.message.length, 200_000);
  assert.equal(validateTranscript(redacted).ok, true);
});

test('transcript redaction uses unambiguous paths for arbitrary JSON keys', () => {
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'key-path-redaction',
    source: 'test',
    steps: [{
      kind: 'message',
      source: 'external',
      fidelity: 'exact',
      message: {
        a: { b: 'private-marker' },
        'a.b': 'private-marker'
      }
    }],
    diagnostics: [],
    redactions: []
  }, {
    secrets: ['private-marker']
  });

  assert.deepEqual(redacted.redactions, [
    { path: '$.steps[0].message["a"]["b"]', reason: 'secret' },
    { path: '$.steps[0].message["a.b"]', reason: 'secret' }
  ]);
  assert.equal(validateTranscript(redacted).ok, true);
});

test('transcript redaction projects JSON keys without collisions or audit-path leaks', () => {
  const reporter = createDiagnosticOccurrenceReporter('json-key-redaction');
  const reported = reporter.report(diagnostic('HOST_STREAM_CLOSED', 'Plain failure.', {
    data: {
      'private-marker': true,
      '[redacted]': 'private-marker value'
    }
  }));
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'json-key-redaction',
    source: 'test',
    startedAt: '2024-01-02T03:04:05.000Z',
    steps: [
      {
        kind: 'message',
        source: 'external',
        fidelity: 'exact',
        message: {
          'private-marker': true,
          '[redacted]': 'private-marker value'
        }
      },
      { kind: 'diagnostic', occurrence: reported }
    ],
    diagnostics: [reported],
    redactions: []
  }, {
    secrets: ['private-marker', '2024']
  });

  const encoded = JSON.stringify(redacted);
  assert.equal(encoded.includes('private-marker'), false);
  assert.equal('startedAt' in redacted, false);
  assert.deepEqual(
    Object.keys(redacted.steps[0]?.message),
    ['[redacted]#1', '[redacted]']
  );
  assert.deepEqual(
    Object.keys(redacted.diagnostics[0]?.diagnostic.data),
    ['[redacted]#1', '[redacted]']
  );
  assert.equal(
    redacted.redactions.some((redaction) => redaction.path.includes('private-marker')),
    false
  );
  assert.equal(redacted.redactions.some((redaction) => redaction.path === '$.startedAt'), true);
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction preserves transcript and input discriminants that collide with secrets', () => {
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'test-transcript',
    source: 'test',
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'test input text payload', paste: false } },
      {
        kind: 'message',
        source: 'input',
        fidelity: 'exact',
        message: { type: 'text', value: 'input payload' }
      }
    ],
    diagnostics: [],
    redactions: []
  }, {
    secrets: ['test', 'input', 'text']
  });

  assert.equal(redacted.source, 'test');
  assert.equal(redacted.steps[0]?.kind, 'input');
  assert.equal(redacted.steps[0]?.event.kind, 'text');
  assert.equal(redacted.steps[1]?.kind, 'message');
  assert.equal(redacted.steps[1]?.source, 'input');
  assert.equal(redacted.steps[0]?.event.text.includes('test'), false);
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction keeps accessibility identifiers unique and references aligned', () => {
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'identifier-redaction',
    source: 'test',
    steps: [{
      kind: 'snapshot',
      snapshot: {
        source: 'test_harness',
        root: {
          id: 'secret-node',
          role: 'application',
          controls: '[redacted]-node',
          children: [{
            id: '[redacted]-node',
            role: 'button',
            label: 'secret label',
            labelledBy: 'secret-node',
            focused: true
          }]
        },
        focusPath: ['secret-node', '[redacted]-node'],
        diagnostics: []
      }
    }],
    diagnostics: [],
    redactions: []
  }, {
    secrets: ['secret']
  });

  const step = redacted.steps[0];
  assert.equal(step?.kind, 'snapshot');
  const root = step.snapshot.root;
  const child = root.children?.[0];
  assert.notEqual(root.id, child?.id);
  assert.equal(root.controls, child?.id);
  assert.equal(child?.labelledBy, root.id);
  assert.deepEqual(step.snapshot.focusPath, [root.id, child?.id]);
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction preserves frame geometry and the render-diff chain', () => {
  const buffer = createFrameBuffer(12, 1);
  const source = {
    elementId: 'secret-field',
    elementKind: 'secret-kind',
    rendererFamily: 'secret-family',
    cellRole: 'text',
    partName: 'secret customer',
    partType: 'secret-part',
    interactionState: 'focused',
    description: 'secret output'
  };
  buffer.write(1, 1, [{ text: 'secret value', source }]);
  const snapshot = buffer.snapshot();
  const frame = {
    width: snapshot.width,
    height: snapshot.height,
    widthProfile: snapshot.widthProfile,
    cells: snapshot.cells,
    accessibility: snapshot.accessibility
  };
  const diff = {
    width: 12,
    height: 1,
    widthProfile: frame.widthProfile,
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'secret value', source }] }]
  };
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'render-redaction',
    source: 'test',
    steps: [{ kind: 'commit', commit: runtimeCommit(frame, diff) }],
    diagnostics: [],
    redactions: []
  }, {
    secrets: ['secret']
  });

  const encoded = JSON.stringify(redacted);
  assert.equal(encoded.includes('secret-field'), false);
  assert.equal(encoded.includes('secret-kind'), false);
  assert.equal(encoded.includes('secret-family'), false);
  assert.equal(encoded.includes('secret customer'), false);
  assert.equal(encoded.includes('secret-part'), false);
  assert.equal(encoded.includes('secret value'), false);
  assert.equal(encoded.includes('secret output'), false);
  const commit = redacted.steps[0]?.commit;
  assert.equal(commit?.frame.cells[0]?.source?.cellRole, 'text');
  assert.equal(commit?.frame.cells[0]?.source?.interactionState, 'focused');
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction does not audit unchanged diagnostic occurrence grammar', () => {
  const reporter = createDiagnosticOccurrenceReporter('audit-owner');
  const reported = reporter.report(diagnostic('HOST_STREAM_CLOSED', 'Plain failure.'));
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'audit',
    source: 'test',
    steps: [{ kind: 'diagnostic', occurrence: reported }],
    diagnostics: [reported],
    redactions: []
  }, {
    secrets: ['diagnostic']
  });

  assert.equal(redacted.steps[0]?.occurrence.id, 'audit-owner:diagnostic:1');
  assert.equal(redacted.diagnostics[0]?.id, 'audit-owner:diagnostic:1');
  assert.deepEqual(redacted.redactions, []);
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);
});

test('transcript redaction rebuilds diagnostic fingerprints before validation and replay', async () => {
  const reporter = createDiagnosticOccurrenceReporter('secret-value-diagnostic');
  const reported = reporter.report(diagnostic('HOST_STREAM_CLOSED', 'Read secret-value.', {
    target: 'secret-value-target',
    cause: { detail: 'secret-value-cause' },
    hint: 'Remove secret-value before retrying.',
    data: { detail: 'secret-value-data' }
  }));
  const redacted = redactTranscript({
    formatVersion: 2,
    id: 'diagnostic-redaction',
    source: 'test',
    steps: [{ kind: 'diagnostic', occurrence: reported }],
    diagnostics: [reported],
    redactions: []
  }, {
    secrets: ['secret-value']
  });

  assert.equal(JSON.stringify(redacted).includes('secret-value'), false);
  assert.notEqual(
    redacted.diagnostics[0]?.diagnostic.fingerprint,
    reported.diagnostic.fingerprint
  );
  assert.equal(
    redacted.diagnostics[0]?.id,
    `${redacted.diagnostics[0]?.owner}:diagnostic:1`
  );
  const validation = validateTranscript(redacted);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.error.message);

  const replayed = await replayTranscript(createTerminalHarness(), redacted);
  assert.equal(
    replayed.transcript.diagnostics[0]?.diagnostic.code,
    'HOST_STREAM_CLOSED'
  );
  assert.equal(validateTranscript(replayed.transcript).ok, true);
});

test('diagnostics normalize causes into JSON-safe transcript data', () => {
  const item = diagnostic('HOST_STREAM_CLOSED', 'Read failed.', {
    cause: new Error('socket closed')
  });
  const reported = occurrence('diagnostic-cause', 1, item);
  const transcript = {
    formatVersion: 2,
    id: 'diagnostic-cause',
    source: 'test',
    steps: [{ kind: 'diagnostic', occurrence: reported }],
    diagnostics: [reported],
    redactions: []
  };
  const invalid = validateTranscript({
    ...transcript,
    diagnostics: [{
      ...reported,
      diagnostic: { ...reported.diagnostic, cause: Number.NaN }
    }]
  });

  assert.deepEqual(item.cause, { name: 'Error', message: 'socket closed' });
  assert.equal(validateTranscript(transcript).ok, true);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error.message, /numbers must be finite/u);
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
    formatVersion: 2,
    id: 'redacted-diagnostic',
    source: 'test',
    steps: [{ kind: 'diagnostic', occurrence: reported }],
    diagnostics: [reported],
    redactions: []
  }).ok, true);
});

test('transcript validation rejects unknown diagnostic codes', () => {
  const invalid = validateTranscript({
    formatVersion: 2,
    id: 'unknown-diagnostic',
    source: 'test',
    steps: [
      {
        kind: 'diagnostic',
        occurrence: {
          id: 'unknown-diagnostic:diagnostic:1',
          owner: 'unknown-diagnostic',
          sequence: 1,
          diagnostic: {
            fingerprint: 'diagnostic:unknown-content',
            code: 'UNKNOWN_DIAGNOSTIC',
            severity: 'error',
            message: 'unknown'
          }
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
    id: `${owner}:diagnostic:${String(sequence)}`,
    owner,
    sequence,
    diagnostic: item
  };
}

function validFrame(width, height, accessibility) {
  return {
    width,
    height,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [],
    accessibility
  };
}

function validDiff(width, height) {
  return {
    width,
    height,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    fullRewrite: true,
    operations: []
  };
}
