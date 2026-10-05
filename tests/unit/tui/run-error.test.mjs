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
  const optional = diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Optional protocol unavailable.', {
    severity: 'warning', data: { requirement: 'optional', outcome: 'rejected' },
  });
  const error = errorFor(optional, partial, diagnostic('TUI_RUN_FAILED', 'Generic run failure.'), cleanup);
  assert.equal(error.message, 'Terminal write may be partial. transport broke Cleanup: Restoration was not verified. recovery transport broke');
  assert.equal(error.primaryDiagnostic, partial);
  assert.equal(error.cause, error.primaryDiagnostic.cause);
  assert.equal(error.exit.diagnostics.length, 4);
});

test('warning required outcomes outrank generic setup errors and retain their hint', () => {
  const error = errorFor(required, diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Required terminal session protocol setup failed.'));
  assert.equal(error.primaryDiagnostic, required);
  assert.equal(error.message, 'Cell order cannot be established. Use independently qualified cell ordering.');
});

test('ordinary failures format a distinct cause once and retain the fallback', () => {
  assert.equal(errorFor().message, 'TUI run failed.');
  assert.equal(errorFor(diagnostic('TUI_RUN_FAILED', 'Run broke.', { cause: new Error('Run broke.') })).message, 'Run broke.');
  assert.equal(errorFor(diagnostic('TUI_RUN_FAILED', 'Run broke.', { cause: ['ignored'] })).message, 'Run broke.');
});

test('the first authoritative failure is retained ahead of later operation and cleanup failures', () => {
  const later = diagnostic('HOST_OUTPUT_INDETERMINATE', 'Later operation failed.', {
    data: { operation: 'mouseReporting', requirement: 'optional', outcome: 'indeterminate' },
  });
  const restore = diagnostic('HOST_RESTORE_FAILED', 'Restore failed first.');
  const flush = diagnostic('TUI_CLEANUP_FAILED', 'Flush failed later.');
  const error = errorFor(required, later, restore, flush);
  assert.equal(error.primaryDiagnostic, required);
  assert.equal(error.message, `${required.message} ${required.hint} Cleanup: ${restore.message}`);
  assert.equal(error.exit.diagnostics.length, 4);
});

test('runtime failure remains primary when restoration and flushing also fail', () => {
  const runtime = diagnostic('TUI_INITIALIZATION_FAILED', 'Initialization failed.', { cause: new Error('app broke') });
  const restore = diagnostic('HOST_RESTORE_FAILED', 'Restore failed.');
  const flush = diagnostic('TUI_CLEANUP_FAILED', 'Flush failed.');
  const error = errorFor(runtime, restore, flush);
  assert.equal(error.primaryDiagnostic, runtime);
  assert.equal(error.cause, runtime.cause);
  assert.equal(error.message, 'Initialization failed. app broke Cleanup: Restore failed.');
  const cleanupOnly = errorFor(restore, flush);
  assert.equal(cleanupOnly.primaryDiagnostic, restore);
  assert.equal(cleanupOnly.message, 'Restore failed. Cleanup: Flush failed.');
});

test('a diagnostic-free failure has no selected primary diagnostic', () => {
  assert.equal(errorFor().primaryDiagnostic, undefined);
});

test('an optional rejected operation does not mask a later runtime or cleanup failure', () => {
  const optional = diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Optional adapter rejection.', {
    data: { operation: 'bracketedPaste', requirement: 'optional', outcome: 'rejected' },
  });
  const runtime = diagnostic('TUI_STARTUP_FAILED', 'Runtime startup failed.');
  const cleanup = diagnostic('TUI_CLEANUP_FAILED', 'Cleanup failed.');
  assert.equal(errorFor(optional, runtime, cleanup).primaryDiagnostic, runtime);
  assert.equal(errorFor(optional, cleanup).primaryDiagnostic, cleanup);
});
