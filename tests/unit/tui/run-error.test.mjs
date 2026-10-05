import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../../../dist/index.js';
import { createAccessibleSnapshot } from '../../../dist/accessibility/index.js';
import { TuiRunError } from '../../../dist/tui/index.js';

const snapshot = createAccessibleSnapshot({ source: 'tui', root: { id: 'failure', role: 'application', label: 'Failure' } });
const errorFor = (...issues) => new TuiRunError({ status: 'error', snapshot,
  diagnostics: issues.map((issue, sequence) => ({ id: String(sequence), owner: 'run', sequence, diagnostic: issue })) });
const required = diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Cell order cannot be established.', {
  severity: 'warning', hint: 'Use independently qualified cell ordering.',
  data: { operation: 'cellPresentation', requirement: 'required', outcome: 'rejected' },
});

test('run errors select the outcome, retain cleanup consequences and share the selected cause', () => {
  const partial = diagnostic('HOST_OUTPUT_INDETERMINATE', 'Terminal write may be partial.', {
    cause: new Error('transport broke'),
    data: { operation: 'focusReporting', requirement: 'optional', outcome: 'indeterminate' },
  });
  const cleanup = diagnostic('HOST_RESTORE_FAILED', 'Restoration was not verified.', { cause: 'recovery transport broke' });
  const error = errorFor(required, partial, diagnostic('TUI_RUN_FAILED', 'Generic run failure.'), cleanup);
  assert.equal(error.message, 'Terminal write may be partial. transport broke Cleanup: Restoration was not verified. recovery transport broke');
  assert.deepEqual(error.cause, partial.cause);
  assert.equal(error.exit.diagnostics.length, 4);
});

test('warning required outcomes outrank generic setup errors and retain their hint', () => {
  const error = errorFor(required, diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Required terminal session protocol setup failed.'));
  assert.equal(error.message, 'Cell order cannot be established. Use independently qualified cell ordering.');
});

test('ordinary failures format a distinct cause once and retain the fallback', () => {
  assert.equal(errorFor().message, 'TUI run failed.');
  assert.equal(errorFor(diagnostic('TUI_RUN_FAILED', 'Run broke.', { cause: new Error('Run broke.') })).message, 'Run broke.');
  assert.equal(errorFor(diagnostic('TUI_RUN_FAILED', 'Run broke.', { cause: ['ignored'] })).message, 'Run broke.');
});
