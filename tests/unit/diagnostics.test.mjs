import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDiagnosticOccurrenceReporter,
  diagnostic,
  diagnosticOccurrenceIssue,
  terminalDiagnosticIssue
} from '../../dist/diagnostics.js';

test('diagnostic fingerprints do not depend on the process locale comparator', () => {
  const options = { data: { z: 1, 'ä': 2 } };
  const expected = diagnostic('TUI_RUN_FAILED', 'stable diagnostic', options).fingerprint;
  const localeCompare = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = function reversed(other) {
      return -localeCompare.call(this, other);
    };
    assert.equal(diagnostic('TUI_RUN_FAILED', 'stable diagnostic', options).fingerprint, expected);
  } finally {
    String.prototype.localeCompare = localeCompare;
  }
});

test('diagnostic fingerprints distinguish contents that collide under the former 32-bit fingerprint', () => {
  const first = diagnostic('TUI_RUN_FAILED', 'candidate-5qshf2-1q2u');
  const second = diagnostic('TUI_RUN_FAILED', 'candidate-d5l61y-2d0e');

  assert.match(first.fingerprint, /^diagnostic:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test('diagnostic fingerprints implement canonical SHA-256 content identity', () => {
  assert.equal(
    diagnostic('TUI_RUN_FAILED', 'known vector').fingerprint,
    'diagnostic:sha256:4e3f5bf7abc346108725e70b4ed0dcee3f180fc43e0198741a1fc35567a2e0fa'
  );
});

test('diagnostic occurrences preserve repeated equal content', () => {
  const reporter = createDiagnosticOccurrenceReporter('test-owner');
  const content = diagnostic('INPUT_TIMEOUT', 'Timed out.');
  const first = reporter.report(content);
  const second = reporter.report(content);

  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  assert.equal(first.owner, 'test-owner');
  assert.equal(terminalDiagnosticIssue(first), undefined);
  assert.equal(diagnosticOccurrenceIssue(first), undefined);
  assert.match(
    diagnosticOccurrenceIssue({ ...first, id: 'wrong' }) ?? '',
    /must match its owner and sequence/u
  );
  assert.match(
    terminalDiagnosticIssue({ ...content, message: 'Changed after fingerprinting.' }) ?? '',
    /fingerprint does not match/u
  );
});
