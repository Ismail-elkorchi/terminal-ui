import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost, indeterminateTerminalWrite } from '../../../dist/host/index.js';
import { applySessionProtocolPolicy, defaultSessionProtocolPolicy } from '../../../dist/tui/index.js';

const methods = ['enableAlternateScreen', 'enableBracketedPaste', 'enableRawInput',
  'enableUnicodeGraphemeMode', 'enableCellPresentation', 'enableMetaSendsEscape',
  'enableKeyboardProfile', 'enableMouseReporting', 'enableFocusReporting', 'hideCursor'];
function traceOperations(session) {
  const attempted = [];
  for (const method of methods) {
    const operation = session[method].bind(session);
    session[method] = (...args) => { attempted.push(method); return operation(...args); };
  }
  return attempted;
}
function assertCompletePlan(result) {
  const established = result.applied.map(item => item.kind === 'cursorVisible' ? 'cursorVisibility' : item.kind);
  const skipped = result.skipped.map(item => item.kind);
  assert.deepEqual([...established, ...skipped].sort(), result.planned.map(item => item.kind).sort());
}

test('required raw-input rejection stops setup before dependent operations and retains the whole plan', async () => {
  const host = createMemoryTerminalHost({ capabilities: { overrides: { rawInput: false } } });
  const session = await host.beginSession({ id: 'required-raw-rejection' });
  const attempted = traceOperations(session);
  const result = await applySessionProtocolPolicy(session, { ...defaultSessionProtocolPolicy, cellPresentation: 'required' });

  assert.equal(result.status, 'failed');
  assert.deepEqual(attempted, ['enableAlternateScreen', 'enableBracketedPaste', 'enableRawInput']);
  assert.deepEqual(result.applied.map(item => item.kind), ['alternateScreen', 'bracketedPaste']);
  assert.deepEqual(result.skipped.map(item => item.kind), result.planned.slice(2).map(item => item.kind));
  assertCompletePlan(result);
  const failure = result.diagnostics.find(item => item.data?.outcome === 'rejected');
  assert.equal(failure.data.operation, 'rawInput');
  assert.equal(failure.data.requirement, 'required');
  assert.equal(result.diagnostics.filter(item => item.data?.reason === 'setup_failed').length, 7);
  assert.equal(result.diagnostics.some(item => item.data?.operation === 'cellPresentation' && item.data?.outcome), false);
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  assert.equal(restored.resultingState.alternateScreen, false);
  assert.equal(restored.resultingState.bracketedPaste, false);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('optional rejection still applies later operations', async () => {
  const host = createMemoryTerminalHost({ capabilities: { overrides: { bracketedPaste: false } } });
  const session = await host.beginSession({ id: 'optional-paste-rejection' });
  const attempted = traceOperations(session);
  const result = await applySessionProtocolPolicy(session);

  assert.equal(result.status, 'ready');
  assert.equal(result.diagnostics.find(item => item.data?.operation === 'bracketedPaste').data.outcome, 'rejected');
  assert.ok(attempted.includes('enableRawInput'));
  assert.ok(attempted.includes('hideCursor'));
  assert.equal(result.resultingState.rawInput, true);
  assertCompletePlan(result);
  assert.equal((await session.restore('success')).status, 'restored');
});

test('an optional indeterminate write stops setup and restores all acquired or uncertain state', async () => {
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  host.write = (chunk, context) => chunk.text === '\u001B[?2004h'
    ? Promise.resolve(indeterminateTerminalWrite(host.id, new Error('partial paste write')))
    : write(chunk, context);
  const session = await host.beginSession({ id: 'optional-paste-partial-write' });
  const attempted = traceOperations(session);
  const result = await applySessionProtocolPolicy(session);

  assert.equal(result.status, 'failed');
  assert.deepEqual(attempted, ['enableAlternateScreen', 'enableBracketedPaste']);
  assert.deepEqual(result.applied.map(item => item.kind), ['alternateScreen']);
  assert.equal(result.diagnostics.find(item => item.data?.outcome === 'indeterminate').data.requirement, 'optional');
  assert.equal(result.resultingState.provenance.bracketedPaste, 'indeterminate');
  assert.equal(result.diagnostics.filter(item => item.data?.reason === 'setup_failed').length, 8);
  assertCompletePlan(result);
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  assert.equal(restored.resultingState.alternateScreen, false);
  assert.equal(restored.resultingState.bracketedPaste, false);
  assert.match(host.output(), /\u001B\[\?2004l/u);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});
