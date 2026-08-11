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

test('diagnostic fingerprints distinguish structurally different contents', () => {
  const first = diagnostic('TUI_RUN_FAILED', 'candidate-5qshf2-1q2u');
  const second = diagnostic('TUI_RUN_FAILED', 'candidate-d5l61y-2d0e');

  assert.match(first.fingerprint, /^diagnostic:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test('diagnostic fingerprints implement canonical SHA-256 content identity', () => {
  assert.equal(
    diagnostic('TUI_RUN_FAILED', 'known vector').fingerprint,
    'diagnostic:sha256:5912de36bb468cc2b6c180de6de9b55f51934cd027fd854c41a04dca51a39d52'
  );
});

test('diagnostic normalization has deterministic depth and node budgets', () => {
  let cause = { leaf: true };
  for (let depth = 0; depth < 2_000; depth += 1) cause = { next: cause };

  const first = diagnostic('TUI_RUN_FAILED', 'deep cause', { cause });
  const second = diagnostic('TUI_RUN_FAILED', 'deep cause', { cause });

  assert.deepEqual(first.cause, { next: { next: { next: '[object Object]' } } });
  assert.equal(first.fingerprint, second.fingerprint);

  const ascending = { a: 1, b: 2, c: 3 };
  const descending = { c: 3, b: 2, a: 1 };
  assert.equal(
    diagnostic('TUI_RUN_FAILED', 'wide data', { data: ascending }).fingerprint,
    diagnostic('TUI_RUN_FAILED', 'wide data', { data: descending }).fingerprint
  );

  const entries = Array.from(
    { length: 1_200 },
    (_value, index) => [`k${String(index).padStart(4, '0')}`, index]
  );
  const ascendingOverflow = diagnostic('TUI_RUN_FAILED', 'overflow', {
    data: Object.fromEntries(entries)
  });
  const descendingOverflow = diagnostic('TUI_RUN_FAILED', 'overflow', {
    data: Object.fromEntries(entries.toReversed())
  });
  assert.deepEqual(ascendingOverflow.data, { value: '[Truncated]' });
  assert.deepEqual(descendingOverflow.data, { value: '[Truncated]' });
  assert.equal(ascendingOverflow.fingerprint, descendingOverflow.fingerprint);

  let reads = 0;
  const wide = {};
  for (let index = 0; index < 5_000; index += 1) {
    Object.defineProperty(wide, `field-${String(index)}`, {
      enumerable: true,
      get() {
        reads += 1;
        return index;
      }
    });
  }
  const bounded = diagnostic('TUI_RUN_FAILED', 'bounded wide data', { data: wide });
  assert.ok(reads <= 1_000, `read ${String(reads)} properties beyond the node budget`);
  assert.deepEqual(bounded.data, { value: '[Truncated]' });
});

test('diagnostic occurrences preserve repeated equal content', () => {
  const reporter = createDiagnosticOccurrenceReporter('test-owner');
  const content = diagnostic('INPUT_TIMEOUT', 'Timed out.');
  const first = reporter.report(content);
  const second = reporter.report(content);

  assert.equal(first.diagnostic, content);
  assert.equal(second.diagnostic, content);
  assert.equal(first.diagnostic.fingerprint, second.diagnostic.fingerprint);
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  assert.equal(first.owner, 'test-owner');
  assert.match(terminalDiagnosticIssue(first) ?? '', /unsupported field: id/u);
  assert.equal(diagnosticOccurrenceIssue(first), undefined);
  assert.match(
    diagnosticOccurrenceIssue({ ...first, extra: true }) ?? '',
    /unsupported field: extra/u
  );
  assert.match(
    diagnosticOccurrenceIssue({ ...first, id: 'wrong' }) ?? '',
    /must match its owner and sequence/u
  );
  assert.match(
    diagnosticOccurrenceIssue({
      ...first,
      diagnostic: { ...content, message: 'Changed after fingerprinting.' }
    }) ?? '',
    /fingerprint does not match/u
  );
  assert.match(
    terminalDiagnosticIssue({ ...content, message: 'Changed after fingerprinting.' }) ?? '',
    /fingerprint does not match/u
  );
});

test('diagnostic content is detached and deeply immutable across reporting boundaries', () => {
  const cause = { nested: { values: ['original-cause'] } };
  const data = { nested: { values: ['original-data'] } };
  const content = diagnostic('TUI_RUN_FAILED', 'Original message.', { cause, data });

  cause.nested.values[0] = 'mutated-cause';
  data.nested.values[0] = 'mutated-data';
  assert.deepEqual(content.cause, { nested: { values: ['original-cause'] } });
  assert.deepEqual(content.data, { nested: { values: ['original-data'] } });
  assert.equal(Object.isFrozen(content), true);
  assert.equal(Object.isFrozen(content.cause), true);
  assert.equal(Object.isFrozen(content.cause.nested), true);
  assert.equal(Object.isFrozen(content.cause.nested.values), true);
  assert.equal(Object.isFrozen(content.data), true);
  assert.equal(Object.isFrozen(content.data.nested.values), true);

  const supplied = JSON.parse(JSON.stringify(content));
  const occurrence = createDiagnosticOccurrenceReporter('immutable-test').report(supplied);
  supplied.message = 'Mutated message.';
  supplied.cause.nested.values[0] = 'mutated-reported-cause';
  supplied.data.nested.values[0] = 'mutated-reported-data';

  assert.notEqual(occurrence.diagnostic, supplied);
  assert.equal(occurrence.diagnostic.message, 'Original message.');
  assert.deepEqual(occurrence.diagnostic.cause, { nested: { values: ['original-cause'] } });
  assert.deepEqual(occurrence.diagnostic.data, { nested: { values: ['original-data'] } });
  assert.equal(Object.isFrozen(occurrence.diagnostic.cause.nested.values), true);
  assert.equal(diagnosticOccurrenceIssue(occurrence), undefined);
  assert.throws(() => {
    occurrence.diagnostic.data.nested.values[0] = 'forbidden';
  }, TypeError);
});

test('independently supplied diagnostics are adopted in one pass', () => {
  const canonical = diagnostic('TUI_RUN_FAILED', 'External diagnostic.', {
    cause: { nested: ['cause'] },
    data: { nested: ['data'] }
  });
  const reads = { cause: 0, data: 0 };
  const causeValues = ['cause'];
  const dataValues = ['data'];
  const suppliedCause = {};
  const suppliedData = {};
  Object.defineProperty(suppliedCause, 'nested', {
    enumerable: true,
    get() {
      reads.cause += 1;
      return causeValues;
    }
  });
  Object.defineProperty(suppliedData, 'nested', {
    enumerable: true,
    get() {
      reads.data += 1;
      return dataValues;
    }
  });
  const supplied = {
    ...canonical,
    cause: suppliedCause,
    data: suppliedData
  };

  const adopted = createDiagnosticOccurrenceReporter('external').report(supplied).diagnostic;

  assert.notEqual(adopted, supplied);
  assert.deepEqual(reads, { cause: 1, data: 1 });
  assert.deepEqual(adopted.cause, { nested: ['cause'] });
  assert.deepEqual(adopted.data, { nested: ['data'] });
  assert.equal(Object.isFrozen(adopted.cause.nested), true);
  assert.equal(Object.isFrozen(adopted.data.nested), true);
  causeValues[0] = 'changed';
  dataValues[0] = 'changed';
  assert.deepEqual(adopted.cause, { nested: ['cause'] });
  assert.deepEqual(adopted.data, { nested: ['data'] });
});
