import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adoptDiagnosticOccurrence,
  adoptTerminalDiagnostic,
  createDiagnosticOccurrenceReporter,
  diagnostic
} from '../../dist/diagnostics.js';
import { decodeAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { decodeInputEvent } from '../../dist/input/index.js';
import { decodeKeyboardProfile } from '../../dist/protocol/index.js';
import { defineTextWidthProfile } from '../../dist/text/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';

const modifiers = { ctrl: false, alt: false, shift: false, meta: false };
const mouseModifiers = { shift: false, alt: false, ctrl: false };

test('transcript validation rejects malformed top-level and step discriminants', () => {
  const cases = [
    [null, /must be an object/u],
    [{}, /format version/u],
    [transcript({ formatVersion: 1 }), /format version/u],
    [transcript(), /id must not be empty/u],
    [transcript({ id: 'valid', source: 'other' }), /source/u],
    [transcript({ id: 'valid', startedAt: 1 }), /startedAt/u],
    [transcript({ id: 'valid', startedAt: '2024-01-02T03:04:05Z' }), /startedAt/u],
    [transcript({ id: 'valid', startedAt: 'not-a-date' }), /startedAt/u],
    [transcript({ id: 'valid', steps: null }), /steps must be an array/u],
    [transcript({ id: 'valid', diagnostics: null }), /diagnostics must be an array/u],
    [transcript({ id: 'valid', redactions: null }), /redactions must be an array/u],
    [transcript({ id: 'valid', extra: true }), /unsupported field: extra/u],
    [transcript({ id: 'valid', steps: [null] }), /step must be an object/u],
    [transcript({ id: 'valid', steps: [{ kind: 'other' }] }), /unsupported step kind/u],
    [transcript({ id: 'valid', steps: [{ kind: 'input', event: { kind: 'end' }, extra: true }] }), /step contains unsupported field/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'other', fidelity: 'exact', message: {} }] }), /message source/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'input', fidelity: 'other', message: {} }] }), /message step fidelity/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'input', fidelity: 'exact' }] }), /requires message/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'input', fidelity: 'exact', message: Number.NaN }] }), /JSON-safe/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'input', fidelity: 'exact', message: () => undefined }] }), /JSON-safe/u],
    [transcript({ id: 'valid', redactions: [{ path: 1, reason: 'secret' }] }), /redaction/u],
    [transcript({ id: 'valid', redactions: [{ path: '$.steps', reason: 'other' }] }), /redaction/u],
    [transcript({ id: 'valid', redactions: [{ path: '$.steps', reason: 'secret', extra: true }] }), /unsupported field/u]
  ];

  for (const [value, pattern] of cases) {
    assertInvalid(value, pattern);
  }
});

test('transcript validation returns a detached canonical value', () => {
  const source = transcript({
    id: 'detached',
    steps: [{ kind: 'input', event: { kind: 'focus', focused: true } }]
  });

  const result = validateTranscript(source);

  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  assert.notEqual(result.value, source);
  assert.notEqual(result.value.steps, source.steps);
  assert.notEqual(result.value.steps[0].event, source.steps[0].event);
  source.steps[0].event.focused = false;
  assert.equal(result.value.steps[0].event.focused, true);
});

test('transcript decoding retains every successful nested adoption', () => {
  const reporter = createDiagnosticOccurrenceReporter('decoded-transcript');
  const occurrence = reporter.report(diagnostic('HOST_STREAM_CLOSED', 'Closed'));
  const snapshot = createTerminalHarness().snapshot();
  const widthProfile = { emoji: 'wide', ambiguous: 'narrow' };
  const frame = {
    width: 2,
    height: 1,
    widthProfile,
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    graphics: [],
    accessibility: snapshot
  };
  const diff = {
    width: 2,
    height: 1,
    widthProfile,
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] }],
    graphicOperations: []
  };
  const source = transcript({
    id: 'nested-adoptions',
    steps: [
      { kind: 'input', event: { kind: 'focus', focused: true } },
      { kind: 'diagnostic', occurrence },
      { kind: 'commit', commit: runtimeCommit(frame, diff) },
      { kind: 'restore', phase: 'shutdown', result: validRestoreResult() }
    ],
    diagnostics: [occurrence]
  });

  const result = validateTranscript(source);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  const input = result.value.steps[0].event;
  const stepOccurrence = result.value.steps[1].occurrence;
  const commit = result.value.steps[2].commit;
  const restore = result.value.steps[3].result;
  assert.strictEqual(decodeInputEvent(input), input);
  assert.strictEqual(adoptDiagnosticOccurrence(stepOccurrence), stepOccurrence);
  assert.strictEqual(adoptTerminalDiagnostic(stepOccurrence.diagnostic), stepOccurrence.diagnostic);
  assert.strictEqual(defineTextWidthProfile(commit.frame.widthProfile), commit.frame.widthProfile);
  assert.strictEqual(defineTextWidthProfile(commit.diff.widthProfile), commit.diff.widthProfile);
  assert.strictEqual(decodeAccessibleSnapshot(commit.frame.accessibility).value, commit.frame.accessibility);
  assert.strictEqual(
    decodeKeyboardProfile(restore.requested.keyboardProfile),
    restore.requested.keyboardProfile
  );
  assert.equal(Object.isFrozen(result.value.steps), true);
  assert.equal(Object.isFrozen(commit.frame.cells), true);
  assert.equal(Object.isFrozen(restore.requested.provenance), true);
});

test('transcript validation accounts resources on the owned snapshot', () => {
  let stepsReads = 0;
  let diagnosticsReads = 0;
  const source = {
    formatVersion: 6,
    omittedSteps: 0,
    id: 'single-read-boundary',
    source: 'test',
    get steps() {
      stepsReads += 1;
      return [];
    },
    get diagnostics() {
      diagnosticsReads += 1;
      return [];
    },
    redactions: []
  };

  const result = validateTranscript(source);
  assert.equal(result.ok, true);
  assert.equal(stepsReads, 1);
  assert.equal(diagnosticsReads, 1);
});

test('transcript validation rejects duplicate and conflicting diagnostic occurrence identities', () => {
  const reporter = createDiagnosticOccurrenceReporter('occurrence-identity');
  const first = reporter.report(diagnostic('HOST_STREAM_CLOSED', 'First failure.'));
  const conflicting = {
    ...first,
    diagnostic: diagnostic('HOST_STREAM_CLOSED', 'Conflicting failure.')
  };

  assertInvalid(transcript({
    id: 'duplicate-step-occurrence',
    steps: [
      { kind: 'diagnostic', occurrence: first },
      { kind: 'diagnostic', occurrence: conflicting }
    ]
  }), /duplicated in steps/u);
  assertInvalid(transcript({
    id: 'duplicate-top-level-occurrence',
    diagnostics: [first, conflicting]
  }), /duplicated in top-level diagnostics/u);
  assertInvalid(transcript({
    id: 'conflicting-cross-collection-occurrence',
    steps: [{ kind: 'diagnostic', occurrence: first }],
    diagnostics: [conflicting]
  }), /conflicting content/u);

  const valid = validateTranscript(transcript({
    id: 'consistent-cross-collection-occurrence',
    steps: [{ kind: 'diagnostic', occurrence: first }],
    diagnostics: [first]
  }));
  assert.equal(valid.ok, true, valid.ok ? undefined : valid.error.message);
});

test('transcript validation rejects over-nested JSON messages without overflowing the runtime stack', () => {
  let message = { value: null };
  for (let depth = 0; depth < 20_000; depth += 1) message = { next: message };

  const result = validateTranscript(transcript({
    id: 'over-nested-message',
    steps: [{ kind: 'message', source: 'external', fidelity: 'exact', message }]
  }));

  assert.equal(result.ok, false);
  assert.match(result.error.message, /nesting limit/u);
});

test('transcript validation enforces caller-selected aggregate resource limits', () => {
  const twoInputSteps = transcript({
    id: 'bounded-steps',
    steps: [
      { kind: 'input', event: { kind: 'focus', focused: true } },
      { kind: 'input', event: { kind: 'focus', focused: false } }
    ]
  });
  assertInvalidWithLimits(twoInputSteps, { maxSteps: 1 }, /1-step limit/u);

  const oversizedCommit = transcript({
    id: 'bounded-render-data',
    steps: [{
      kind: 'commit',
      commit: {
        frame: { cells: [{}, {}] },
        diff: { operations: [{}, {}] }
      }
    }]
  });
  assertInvalidWithLimits(oversizedCommit, { maxFrameCells: 1 }, /1-frame-cell limit/u);
  assertInvalidWithLimits(oversizedCommit, { maxDiffOperations: 1 }, /1-diff-operation limit/u);

  assertInvalidWithLimits(
    transcript({ id: 'bounded-diagnostics', diagnostics: [{}, {}] }),
    { maxDiagnostics: 1 },
    /1-diagnostic limit/u
  );
  assertInvalidWithLimits(
    transcript({ id: 'bounded-redactions', redactions: [{}, {}] }),
    { maxRedactions: 1 },
    /1-redaction limit/u
  );
  assertInvalidWithLimits(
    transcript({ id: 'identifier-that-exceeds-the-selected-limit' }),
    { maxStringCodeUnits: 20 },
    /20-string-code-unit limit/u
  );
  assertInvalidWithLimits(transcript({ id: 'invalid-limit' }), { maxSteps: 0 }, /positive safe integer/u);

  const recorder = createTranscriptRecorder({ id: 'bounded-recorder' });
  recorder.reportDiagnostic(diagnostic('INPUT_TIMEOUT', 'Timed out.'));
  assert.equal(validateTranscript(recorder.snapshot(), { maxDiagnostics: 1 }).ok, true);

  const largeString = 'x'.repeat(600_000);
  assertInvalidWithLimits(
    transcript({
      id: 'aggregate-strings',
      steps: [{
        kind: 'message',
        source: 'input',
        fidelity: 'exact',
        message: { first: largeString, second: largeString }
      }]
    }),
    { maxStringCodeUnits: 1_000_000 },
    /1000000-string-code-unit limit/u
  );
});

test('transcript validation rejects malformed input-event variants', () => {
  const validKey = {
    kind: 'key',
    key: 'enter',
    modifiers,
    eventType: 'press',
    location: 'standard'
  };
  const validMouse = {
    kind: 'mouse',
    sequence: '\u001B[<0;1;1M',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: 1,
    column: 1,
    rawCode: 0,
    modifiers: mouseModifiers
  };
  const validWheel = {
    ...validMouse,
    action: 'wheel',
    button: 'wheelUp',
    deltaRows: -1,
    deltaColumns: 0
  };
  const events = [
    [null, /input event must be an object/u],
    [{ kind: 'text', text: 1, paste: false }, /text event/u],
    [{ kind: 'paste', text: 'x', bracketed: 'yes' }, /paste event/u],
    [{ ...validKey, key: 'other' }, /key name/u],
    [{ ...validKey, modifiers: null }, /requires modifiers/u],
    [{ ...validKey, modifiers: { ...modifiers, ctrl: 1 } }, /require ctrl/u],
    [{ ...validKey, modifiers: { ...modifiers, extra: true } }, /unsupported field/u],
    [{ ...validKey, extra: true }, /input event contains unsupported field/u],
    [{ ...validKey, sequence: 1 }, /sequence/u],
    [{ ...validKey, committedText: 1 }, /committedText/u],
    [{ ...validKey, keyCodePoint: 0xd800 }, /code point/u],
    [{ ...validKey, alternateCodePoints: {} }, /requires shifted or baseLayout/u],
    [{ ...validKey, alternateCodePoints: { shifted: 0xd800 } }, /shifted alternate/u],
    [{ ...validKey, eventType: 'other' }, /eventType/u],
    [{ ...validKey, location: 'other' }, /location/u],
    [{ ...validMouse, encoding: 'other' }, /mouse encoding/u],
    [{ ...validMouse, action: 'other' }, /mouse action/u],
    [{ ...validMouse, button: 'other' }, /mouse button/u],
    [{ ...validMouse, row: 0 }, /positive integers/u],
    [{ ...validMouse, rawCode: 0.5 }, /rawCode/u],
    [{ ...validMouse, modifiers: { ...mouseModifiers, alt: 1 } }, /require alt/u],
    [withoutFields(validWheel, 'deltaRows', 'deltaColumns'), /finite deltaRows and deltaColumns/u],
    [{ ...validWheel, deltaRows: Number.NaN }, /numbers must be finite/u],
    [{ ...validWheel, deltaColumns: Number.POSITIVE_INFINITY }, /numbers must be finite/u],
    [{ ...validWheel, button: 'left' }, /wheel-compatible button/u],
    [{ ...validMouse, button: 'wheelDown' }, /pointer-compatible button/u],
    [{ kind: 'resize', terminalSize: { columns: 0, rows: 1 } }, /terminal size/u],
    [{ kind: 'resize', viewport: { columns: 1, rows: 1 } }, /unsupported field/u],
    [{ kind: 'focus', focused: 'yes' }, /focus event/u],
    [{ kind: 'signal', signal: '' }, /signal event/u],
    [{ kind: 'signal', signal: 'SIGUSR1' }, /signal event/u],
    [{ kind: 'unknown', sequence: 1 }, /unknown event/u],
    [{ kind: 'other' }, /unsupported input event/u]
  ];

  for (const [event, pattern] of events) {
    assertInvalid(transcript({ id: 'invalid-input', steps: [{ kind: 'input', event }] }), pattern);
  }
  assert.equal(validateTranscript(transcript({
    id: 'valid-wheel-input',
    steps: [{ kind: 'input', event: validWheel }]
  })).ok, true);
});

test('transcript validation rejects malformed frame and render-diff payloads', () => {
  const snapshot = createTerminalHarness().snapshot();
  const validFrame = {
    width: 2,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    graphics: [],
    accessibility: snapshot
  };
  const validDiff = {
    width: 2,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] }],
    graphicOperations: []
  };
  const frames = [
    [{ ...validFrame, width: -1 }, /width and height/u],
    [{ ...validFrame, cells: null }, /cells must be an array/u],
    [{ ...validFrame, cells: [null] }, /cell 0/u],
    [{ ...validFrame, cells: [{ row: 0, column: 1, text: 'x', width: 1 }] }, /positive integers/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 1, width: 1 }] }, /text must be a string/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 'x', width: -1 }] }, /width must be/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 'x', width: 1, style: { bold: 'yes' } }] }, /bold must be a boolean/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 'x', width: 1, link: { href: 1 } }] }, /href must be a string/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 'x', width: 1, source: { itemIndex: -1 } }] }, /itemIndex/u],
    [{ ...validFrame, cursor: { row: 0, column: 1 } }, /frame cursor/u],
    [{ ...validFrame, cursor: { row: 1, column: 1, style: { fg: { kind: 'ansi', value: 256 } } } }, /integer from 0 through 255/u],
    [{ ...validFrame, hitTargets: [{ id: 'row', bounds: { row: 1, column: 1, width: 1, height: 1 }, accepts: ['other'] }] }, /pointer event kinds/u],
    [{ ...validFrame, focusPath: [1] }, /focusPath/u],
    [{ ...validFrame, metadata: { arbitrary: true } }, /unsupported field: metadata/u],
    [{ ...validFrame, accessibility: null }, /accessibility/u]
  ];
  const diffs = [
    [{ ...validDiff, width: -1 }, /width and height/u],
    [{ ...validDiff, fullRewrite: 1 }, /fullRewrite/u],
    [{ ...validDiff, operations: null }, /operations must be an array/u],
    [{ ...validDiff, cursor: { row: 2, column: 1 } }, /cursor must fit/u],
    [{ ...validDiff, dirtyRegions: {} }, /dirtyRegions must be an array/u],
    [{ ...validDiff, dirtyRegions: [{ row: 1, column: 1, width: 3, height: 1 }] }, /bounds must fit/u],
    [{ ...validDiff, operations: [null] }, /operation must be an object/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [] }] }, /at least one span/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: '' }] }] }, /at least one terminal cell/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x', style: { fg: { kind: 'rgb', r: 0, g: Number.NaN, b: 0 } } }] }] }, /numbers must be finite/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x', link: { href: 'x', extra: true } }] }] }, /unsupported field/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 2, spans: [{ text: 'xx' }] }] }, /must fit/u],
    [{ ...validDiff, operations: [{ kind: 'clearRect', bounds: { row: 0, column: 1, width: 1, height: 1 } }] }, /clearRect bounds/u],
    [{ ...validDiff, operations: [{ kind: 'other' }] }, /unsupported diff operation/u]
  ];
  for (const [frame, pattern] of frames) {
    assertInvalid(transcript({
      id: 'invalid-frame',
      steps: [{ kind: 'commit', commit: runtimeCommit(frame, validDiff) }]
    }), pattern);
  }
  for (const [diff, pattern] of diffs) {
    assertInvalid(transcript({
      id: 'invalid-diff',
      steps: [{ kind: 'commit', commit: runtimeCommit(validFrame, diff) }]
    }), pattern);
  }
});

test('transcript validation rejects unknown fields at every nested persisted boundary', () => {
  const snapshot = createTerminalHarness().snapshot();
  const cell = { row: 1, column: 1, text: 'x', width: 1 };
  const frame = {
    width: 2,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [cell],
    graphics: [],
    accessibility: snapshot
  };
  const write = { kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] };
  const diff = {
    width: 2,
    height: 1,
    widthProfile: frame.widthProfile,
    fullRewrite: true,
    operations: [write],
    graphicOperations: []
  };
  const commit = runtimeCommit(frame, diff);
  const target = {
    id: 'target',
    bounds: { row: 1, column: 1, width: 1, height: 1 },
    focus: { kind: 'focus', path: ['target'] }
  };
  const commitCases = [
    { ...commit, extra: true },
    { ...commit, terminalSize: { ...commit.terminalSize, extra: true } },
    { ...commit, frame: { ...frame, cells: [{ ...cell, extra: true }] } },
    { ...commit, frame: { ...frame, cells: [{ ...cell, link: { href: 'https://example.test', extra: true } }] } },
    { ...commit, frame: { ...frame, cells: [{ ...cell, source: { elementId: 'cell', extra: true } }] } },
    { ...commit, frame: { ...frame, cells: [{ ...cell, style: { bold: true, extra: true } }] } },
    { ...commit, frame: { ...frame, widthProfile: { ...frame.widthProfile, extra: true } } },
    { ...commit, frame: { ...frame, cursor: { row: 1, column: 1, extra: true } } },
    { ...commit, frame: { ...frame, hitTargets: [{ ...target, extra: true }] } },
    { ...commit, frame: { ...frame, hitTargets: [{ ...target, bounds: { ...target.bounds, extra: true } }] } },
    { ...commit, frame: { ...frame, hitTargets: [{ ...target, focus: { ...target.focus, extra: true } }] } },
    { ...commit, diff: { ...diff, widthProfile: { ...diff.widthProfile, extra: true } } },
    { ...commit, diff: { ...diff, cursor: { row: 1, column: 1, extra: true } } },
    { ...commit, diff: { ...diff, dirtyRegions: [{ row: 1, column: 1, width: 1, height: 1, extra: true }] } },
    { ...commit, diff: { ...diff, operations: [{ ...write, extra: true }] } },
    { ...commit, diff: { ...diff, operations: [{ ...write, spans: [{ text: 'x', extra: true }] }] } },
    { ...commit, diff: { ...diff, operations: [{ kind: 'clearRect', bounds: { row: 1, column: 1, width: 1, height: 1 }, extra: true }] } },
    { ...commit, diff: { ...diff, operations: [{ kind: 'clearRect', bounds: { row: 1, column: 1, width: 1, height: 1, extra: true } }] } }
  ];

  for (const [index, invalidCommit] of commitCases.entries()) {
    assertInvalid(transcript({
      id: `unknown-commit-field-${String(index)}`,
      steps: [{ kind: 'commit', commit: invalidCommit }]
    }), /unsupported field/u);
  }

});

test('transcript validation measures writes with the diff width profile', () => {
  const snapshot = createTerminalHarness().snapshot();
  const widthProfile = { emoji: 'narrow', ambiguous: 'narrow' };
  const frame = {
    width: 1,
    height: 1,
    widthProfile,
    cells: [{ row: 1, column: 1, text: '🙂', width: 1 }],
    graphics: [],
    accessibility: snapshot
  };
  const diff = {
    width: 1,
    height: 1,
    widthProfile,
    fullRewrite: true,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: '🙂' }] }],
    graphicOperations: []
  };
  const result = validateTranscript(transcript({
    id: 'narrow-emoji-diff',
    steps: [{
      kind: 'commit',
      commit: {
        ...runtimeCommit(frame, diff),
        terminalSize: { columns: 1, rows: 1 }
      }
    }]
  }));

  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
});

test('transcript validation requires a replayable diff chain matching bundled frames', () => {
  const snapshot = createTerminalHarness().snapshot();
  const widthProfile = { emoji: 'wide', ambiguous: 'narrow' };
  const frame = (text) => ({
    width: 1,
    height: 1,
    widthProfile,
    cells: [{ row: 1, column: 1, text, width: 1 }],
    graphics: [],
    accessibility: snapshot
  });
  const diff = (text, fullRewrite) => ({
    width: 1,
    height: 1,
    widthProfile,
    fullRewrite,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text }] }],
    graphicOperations: []
  });
  const commit = (id, stateVersion, committedFrame, committedDiff) => ({
    id,
    stateVersion,
    terminalSize: { columns: 1, rows: 1 },
    frame: committedFrame,
    diff: committedDiff
  });

  assertInvalid(transcript({
    id: 'incremental-first-commit',
    steps: [{ kind: 'commit', commit: commit('commit:1', 0, frame('x'), diff('x', false)) }]
  }), /first commit.*full rewrite/u);
  assertInvalid(transcript({
    id: 'contradictory-commit',
    steps: [{ kind: 'commit', commit: commit('commit:1', 0, frame('x'), diff('y', true)) }]
  }), /does not reproduce its frame/u);
  assertInvalid(transcript({
    id: 'contradictory-cursor-style',
    steps: [{
      kind: 'commit',
      commit: commit(
        'commit:1',
        0,
        { ...frame('x'), cursor: { row: 1, column: 1, style: { bold: true } } },
        { ...diff('x', true), cursor: { row: 1, column: 1, style: { italic: true } } }
      )
    }]
  }), /does not reproduce its frame/u);
  assertInvalid(transcript({
    id: 'contradictory-cursor-source',
    steps: [{
      kind: 'commit',
      commit: commit(
        'commit:1',
        0,
        { ...frame('x'), cursor: { row: 1, column: 1, source: { elementId: 'frame' } } },
        { ...diff('x', true), cursor: { row: 1, column: 1, source: { elementId: 'diff' } } }
      )
    }]
  }), /does not reproduce its frame/u);

  const valid = validateTranscript(transcript({
    id: 'replayable-chain',
    steps: [
      { kind: 'commit', commit: commit('commit:1', 0, frame('x'), diff('x', true)) },
      { kind: 'commit', commit: commit('commit:2', 1, frame('y'), diff('y', false)) }
    ]
  }));
  assert.equal(valid.ok, true, valid.ok ? undefined : valid.error.message);
});

test('transcript validation accepts an ordered terminal restore sequence', () => {
  const restore = validRestoreResult();
  const result = validateTranscript(transcript({
    id: 'ordered-restores',
    steps: [
      { kind: 'restore', phase: 'checkpoint', result: restore },
      { kind: 'restore', phase: 'shutdown', result: restore }
    ]
  }));

  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
});

test('transcript validation rejects malformed structured restore results', () => {
  const restore = validRestoreResult();
  const state = restore.requested;
  const cases = [
    [null, /must be an object/u],
    [{ ...restore, requested: { ...state, provenance: { ...state.provenance, extra: true } } }, /unsupported field/u],
    [{ ...restore, requested: { ...state, keyboardProfile: { ...state.keyboardProfile, extra: true } } }, /unsupported field/u],
    [{ ...restore, attempted: [{ kind: 'rawInput', enabled: false, extra: true }] }, /unsupported field/u],
    [{
      ...restore,
      attempted: [{ kind: 'rawInput', enabled: false }],
      completed: [{ kind: 'rawInput', enabled: false, assurance: 'assumed' }]
    }, /requires assurance/u],
    [{ ...restore, requested: { ...state, rawInput: 'no' } }, /rawInput/u],
    [{ ...restore, requested: { ...state, alternateScreen: 'no' } }, /alternateScreen/u],
    [{ ...restore, requested: { ...state, bracketedPaste: 'no' } }, /bracketedPaste/u],
    [{ ...restore, requested: { ...state, mouseReporting: 'other' } }, /mouseReporting/u],
    [{ ...restore, requested: { ...state, focusReporting: 'no' } }, /focusReporting/u],
    [{ ...restore, requested: { ...state, keyboardProfile: { kind: 'kitty', flags: 16 } } }, /keyboardProfile/u],
    [{ ...restore, requested: { ...state, cursorVisible: 'yes' } }, /cursorVisible/u],
    [{
      ...restore,
      completed: [{ kind: 'rawInput', enabled: false, assurance: 'sent' }]
    }, /completed operations must be an ordered subset of attempted operations/u],
    [{
      ...restore,
      attempted: [{ kind: 'rawInput', enabled: false }],
      completed: [{ kind: 'rawInput', enabled: true, assurance: 'sent' }]
    }, /completed operations must be an ordered subset of attempted operations/u],
    [{
      ...restore,
      attempted: [
        { kind: 'rawInput', enabled: false },
        { kind: 'cursorVisible', enabled: true }
      ],
      completed: [
        { kind: 'cursorVisible', enabled: true, assurance: 'sent' },
        { kind: 'rawInput', enabled: false, assurance: 'observed' }
      ]
    }, /completed operations must be an ordered subset of attempted operations/u]
  ];

  for (const [value, pattern] of cases) {
    assertInvalid(transcript({
      id: 'invalid-restore',
      steps: [{ kind: 'restore', phase: 'shutdown', result: value }]
    }), pattern);
  }
});

function transcript(overrides = {}) {
  return {
    formatVersion: 6,
    omittedSteps: 0,
    id: '',
    source: 'test',
    steps: [],
    diagnostics: [],
    redactions: [],
    ...overrides
  };
}

function assertInvalid(value, pattern) {
  const result = validateTranscript(value);
  assert.equal(result.ok, false);
  assert.match(result.error.message, pattern);
}

function assertInvalidWithLimits(value, limits, pattern) {
  const result = validateTranscript(value, limits);
  assert.equal(result.ok, false);
  assert.match(result.error.message, pattern);
}

function runtimeCommit(frame, diff) {
  return {
    id: 'runtime:commit:1',
    stateVersion: 0,
    terminalSize: { columns: 2, rows: 1 },
    frame,
    diff
  };
}

function withoutFields(value, ...fields) {
  const copy = { ...value };
  for (const field of fields) delete copy[field];
  return copy;
}

function validRestoreResult() {
  const state = {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: { tracking: 'none', encoding: 'default' },
    focusReporting: false,
    unicodeGraphemeMode: false,
    keyboardProfile: { kind: 'legacy' },
    cursorVisible: true,
    provenance: {
      rawInput: 'observed',
      alternateScreen: 'assumed',
      bracketedPaste: 'assumed',
      mouseReporting: 'assumed',
      focusReporting: 'assumed',
      unicodeGraphemeMode: 'assumed',
      keyboardProfile: 'assumed',
      cursorVisible: 'assumed'
    }
  };
  return {
    status: 'restored',
    reason: 'success',
    requested: state,
    attempted: [],
    completed: [],
    resultingState: state,
    diagnostics: []
  };
}
