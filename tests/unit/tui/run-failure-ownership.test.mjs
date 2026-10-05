import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../../../dist/index.js';
import { createMemoryTerminalHost, indeterminateTerminalWrite } from '../../../dist/host/index.js';
import { defaultSessionProtocolPolicy, defineTui, runTui, TuiRunError } from '../../../dist/tui/index.js';
import { text, textInput } from '../../../dist/components/index.js';
import { ignoreMessage } from '../../../dist/component/index.js';
import { waitUntil } from '../../support/async.ts';

function traceSession(host, rejectRaw = () => false) {
  const attempted = [];
  const begin = host.beginSession.bind(host);
  host.beginSession = async options => {
    const session = await begin(options);
    for (const method of ['enableAlternateScreen', 'enableBracketedPaste', 'enableRawInput',
      'enableUnicodeGraphemeMode', 'enableCellPresentation', 'enableMetaSendsEscape',
      'enableKeyboardProfile', 'enableMouseReporting', 'enableFocusReporting', 'hideCursor']) {
      const operation = session[method].bind(session);
      session[method] = (...args) => {
        attempted.push({ session: session.id, method });
        if (method === 'enableRawInput' && rejectRaw()) return Promise.resolve({
          status: 'rejected', diagnostic: diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Raw input was rejected by the adapter.', { severity: 'warning' }), diagnostics: [],
        });
        return operation(...args);
      };
    }
    return session;
  };
  return attempted;
}
function simpleApp(init) {
  return defineTui({ id: 'failure-owner', init, update: state => ({ state }), view: () => text({ content: 'Ready' }) });
}
function assertPrimary(error, operation, outcome) {
  assert.ok(error instanceof TuiRunError);
  assert.equal(error.primaryDiagnostic.data.operation, operation);
  assert.equal(error.primaryDiagnostic.data.outcome, outcome);
  assert.equal(error.cause, error.primaryDiagnostic.cause);
  assert.ok(error.message.startsWith(error.primaryDiagnostic.message));
  assert.ok(error.exit.diagnostics.some(item => item.diagnostic === error.primaryDiagnostic));
}

test('required raw-input rejection remains primary through restore and flush failures, without initialization', async () => {
  const host = createMemoryTerminalHost({ capabilities: { overrides: { rawInput: false } } });
  const attempted = traceSession(host);
  const begin = host.beginSession.bind(host);
  host.beginSession = async options => {
    const session = await begin(options);
    session.restore = () => { throw new Error('session restoration failed'); };
    return session;
  };
  host.flush = async () => { throw new Error('output flush failed'); };
  let initialized = false;
  await assert.rejects(runTui(simpleApp(() => { initialized = true; return { state: {} }; }), { host }), error => {
    assertPrimary(error, 'rawInput', 'rejected');
    assert.ok(error.exit.diagnostics.some(item => item.diagnostic.code === 'HOST_RESTORE_FAILED'));
    assert.ok(error.exit.diagnostics.some(item => item.diagnostic.data?.phase === 'flush'));
    assert.match(error.message, /Cleanup: Terminal session restore failed\. session restoration failed/u);
    assert.doesNotMatch(error.message, /output flush failed/u);
    return true;
  });
  assert.deepEqual(attempted.map(item => item.method), ['enableAlternateScreen', 'enableBracketedPaste', 'enableRawInput']);
  assert.equal(initialized, false);
  assert.equal(host.frames().length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().at(-1).status, 'restored');
});

test('initialization failure keeps its selected diagnostic when terminal finalization also fails', async () => {
  const host = createMemoryTerminalHost();
  host.flush = async () => { throw new Error('flush failed second'); };
  await assert.rejects(runTui(simpleApp(() => { throw new Error('initialization failed first'); }), { host }), error => {
    assert.ok(error instanceof TuiRunError);
    assert.equal(error.primaryDiagnostic.code, 'TUI_STARTUP_FAILED');
    assert.equal(error.cause, error.primaryDiagnostic.cause);
    assert.match(error.message, /initialization failed first/u);
    assert.match(error.message, /Cleanup:.*flush failed second/u);
    return true;
  });
  assert.equal(host.frames().length, 0);
  assert.equal(host.restores().at(-1).status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

for (const phase of ['startup', 'resume']) {
  for (const failure of ['raw-rejection', 'partial-write']) {
    test(`${phase} ${failure} stops dependent session operations and publishes no subsequent frame`, async () => {
      const host = createMemoryTerminalHost();
      let fail = phase === 'startup';
      const attempted = traceSession(host, () => fail && failure === 'raw-rejection');
      const write = host.write.bind(host);
      host.write = (chunk, context) => fail && failure === 'partial-write' && chunk.text === '\u001B[?2004h'
        ? Promise.resolve(indeterminateTerminalWrite(host.id, new Error('partial paste enable')))
        : write(chunk, context);
      let initialized = false;
      let resumed = false;
      let framesBeforeFailure = 0;
      const app = defineTui({ id: `${phase}-${failure}`,
        init: () => { initialized = true; return { state: {} }; },
        update: state => ({ state, effects: [{ id: 'suspend', concurrency: 'keep-first', async run(context) {
          await context.withTerminalSuspended(async () => {
            framesBeforeFailure = host.frames().length;
            fail = true;
          });
          resumed = true;
          return { kind: 'none' };
        } }] }),
        view: () => textInput({ id: 'field', meta: { accessibleName: 'Field' }, state: { text: '', cursor: 0 },
          onTransition: () => ignoreMessage(), onSubmit: () => ({ kind: 'suspend' }) }),
      });
      const running = runTui(app, { host, sessionPolicy: defaultSessionProtocolPolicy, graphics: 'none' });
      // Attach the rejection handler before dispatching input to the active runtime.
      const rejected = assert.rejects(running, error => {
        assertPrimary(error, failure === 'raw-rejection' ? 'rawInput' : 'bracketedPaste',
          failure === 'raw-rejection' ? 'rejected' : 'indeterminate');
        return true;
      });
      if (phase === 'resume') {
        await waitUntil(() => host.frames().length > 0);
        host.input('\r');
      }
      await rejected;
      const failedSession = phase === 'startup' ? app.id : `${app.id}:resume:1`;
      assert.deepEqual(attempted.filter(item => item.session === failedSession).map(item => item.method),
        failure === 'raw-rejection'
          ? ['enableAlternateScreen', 'enableBracketedPaste', 'enableRawInput']
          : ['enableAlternateScreen', 'enableBracketedPaste']);
      assert.equal(initialized, phase === 'resume');
      assert.equal(resumed, false);
      assert.equal(host.frames().length, framesBeforeFailure);
      assert.equal(host.stdin.isRawModeEnabled(), false);
      assert.equal(host.restores().at(-1).status, 'restored');
    });
  }
}
