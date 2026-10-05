import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { defaultSessionProtocolPolicy, defineTui, runTui, TuiRunError } from '../../../dist/tui/index.js';
import { textInput } from '../../../dist/components/index.js';
import { defineTextPresentation, segmentGraphemes } from '../../../dist/text/index.js';
import { ignoreMessage } from '../../../dist/component/index.js';
import { waitUntil } from '../../support/async.ts';

const textPresentation = defineTextPresentation({ map: request => segmentGraphemes(request.text.slice(request.startOffset, request.endOffsetExclusive)).map(cluster => ({
  text: cluster.text, startOffset: cluster.startOffset + request.startOffset,
  endOffsetExclusive: cluster.endOffsetExclusive + request.startOffset, direction: 'ltr',
})) });
const sessionPolicy = { ...defaultSessionProtocolPolicy, alternateScreen: 'disabled', bracketedPaste: 'disabled',
  focusReporting: 'disabled', metaSendsEscape: 'disabled', unicodeGraphemeMode: 'disabled', cellPresentation: 'required',
  keyboard: { ...defaultSessionProtocolPolicy.keyboard, requirement: 'disabled' },
  cursorVisibility: { visibility: 'unchanged', requirement: 'disabled' }, mouseReporting: { mode: 'none', requirement: 'disabled' } };

function modeHost(initialMode = 1, qualification = 'mode-8-reset') {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 3 },
    ...(qualification === null ? {} : { cellPresentation: { qualification } }),
  });
  let mode = initialMode;
  let surfaceClears = 0;
  const observe = chunk => {
    const text = String(chunk);
    if (text.includes('\u001B[2J')) surfaceClears += 1;
    if (text.includes('\u001B[8l')) mode = 2;
    if (text.includes('\u001B[8h')) mode = 1;
    const queries = [...text.matchAll(/\u001B\[(\??)(\d+)\$p/gu)];
    if (queries.length > 0) host.input(`${queries.map(([, prefix, number]) =>
      `\u001B[${prefix}${number};${prefix === '' && number === '8' ? mode : 0}$y`).join('')}\u001B[?1;2c`);
  };
  const write = host.stdout.write.bind(host.stdout);
  host.stdout.write = async (chunk, context) => { await write(chunk, context); observe(chunk); };
  const recovery = host.stdout.writeRecovery.bind(host.stdout);
  host.stdout.writeRecovery = async (chunk, context) => { const receipt = await recovery(chunk, context); if (receipt.status === 'committed') observe(chunk); return receipt; };
  return { host, mode: () => mode, setMode: value => { mode = value; }, surfaceClears: () => surfaceClears };
}
function app(extra = {}) {
  return defineTui({ id: 'cell-presentation-lifecycle',
    init: () => ({ state: { value: 'logical' } }),
    update: state => ({ state, exit: {} }),
    view: state => textInput({ id: 'field', meta: { accessibleName: 'Field' }, state: { text: state.value, cursor: 0 },
      onTransition: () => ignoreMessage(), onSubmit: () => ({ kind: 'submit' }) }),
    ...extra,
  });
}
function assertRestored(emulator) {
  assert.equal(emulator.mode(), 1);
  assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
  assert.equal(emulator.host.restores().at(-1).status, 'restored');
  assert.equal(emulator.host.restores().at(-1).resultingState.bidiMode, 'implicit');
}

test('explicit TUI configuration rejects missing mapping before any terminal operation', async () => {
  const { host } = modeHost();
  await assert.rejects(runTui(app(), { host, sessionPolicy, graphics: 'none' }), TuiRunError);
  assert.equal(host.output(), '');
  await assert.rejects(runTui(app(), { host, textPresentation, graphics: 'none' }), TuiRunError);
  assert.equal(host.output(), '');
});

test('startup failure after establishing presentation restores its observed baseline', async () => {
  const emulator = modeHost();
  await assert.rejects(runTui(app({ init: () => { throw new Error('injected startup failure'); } }), {
    host: emulator.host, textPresentation, sessionPolicy, graphics: 'none',
  }), TuiRunError);
  assert.ok(emulator.host.output().includes('\u001B[8l'));
  assertRestored(emulator);
});

test('interruption restores presentation after a committed frame', async () => {
  const emulator = modeHost();
  const running = runTui(app(), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  assert.equal(emulator.mode(), 2);
  emulator.host.signals.emit('SIGINT');
  assert.equal((await running).status, 'interrupted');
  assertRestored(emulator);
});

test('suspension restores the outer mode and reestablishes presentation before output resumes', async () => {
  const emulator = modeHost();
  let external = false;
  const program = app({ update: (state, message) => message.kind === 'done' ? { state, exit: {} } : {
    state,
    effects: [{ id: 'suspend', concurrency: 'keep-first', async run(context) {
      await context.withTerminalSuspended(async () => {
        assert.equal(emulator.mode(), 1);
        assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
        external = true;
      });
      return { kind: 'message', message: { kind: 'done' } };
    } }],
  } });
  const running = runTui(program, { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  emulator.host.input('\r');
  assert.equal((await running).status, 'completed');
  assert.equal(external, true);
  assert.equal(emulator.surfaceClears(), 2, 'one fresh surface per startup and resume acquisition');
  assertRestored(emulator);
  assert.deepEqual(emulator.host.output().match(/\u001B\[8[hl]/gu), ['\u001B[8l', '\u001B[8h', '\u001B[8l', '\u001B[8h']);
});

test('ordinary default session starts on a caller-qualified explicit host without mapping', async () => {
  const host = createMemoryTerminalHost({ cellPresentation: { qualification: 'existing' } });
  const running = runTui(app(), { host, graphics: 'none' });
  await waitUntil(() => host.frames().length > 0);
  host.input('\r');
  assert.equal((await running).status, 'completed');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.doesNotMatch(host.output(), /\u001B\[8[hl]|\u001B\[2J/u);
  assert.equal(host.restores().at(-1).resultingState.cellPresentation, 'application-ordered');
});

test('ordinary session starts on an observed explicit host without mapping', async () => {
  const emulator = modeHost(2);
  emulator.host.runtime = 'node';
  const originalCapabilities = emulator.host.getCapabilities;
  emulator.host.getCapabilities = options => originalCapabilities({ ...options, activeProbes: ['terminalModes'] });
  const running = runTui(app(), { host: emulator.host,
    sessionPolicy: { ...sessionPolicy, cellPresentation: 'disabled' }, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  emulator.host.input('\r');
  assert.equal((await running).status, 'completed');
  assert.equal(emulator.mode(), 2);
  assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
  assert.equal(emulator.surfaceClears(), 0);
  assert.doesNotMatch(emulator.host.output(), /\u001B\[8[hl]/u);
  assert.equal(emulator.host.restores().at(-1).resultingState.cellPresentation, 'application-ordered');
});

test('ordinary session resumes on a newly explicit terminal and preserves its external baseline', async () => {
  const emulator = modeHost();
  emulator.host.runtime = 'node';
  let resumed = false;
  const logicalPolicy = { ...sessionPolicy, cellPresentation: 'disabled' };
  const originalCapabilities = emulator.host.getCapabilities;
  emulator.host.getCapabilities = options => originalCapabilities({ ...options, activeProbes: ['terminalModes'] });
  const program = app({ update: (state, message) => message.kind === 'done' ? { state, exit: {} } : {
    state,
    effects: [{ id: 'external-mode-change', concurrency: 'keep-first', async run(context) {
      await context.withTerminalSuspended(async () => { await emulator.host.write({ text: '\u001B[8l' }); });
      resumed = true;
      return { kind: 'message', message: { kind: 'done' } };
    } }],
  } });
  const running = runTui(program, { host: emulator.host, sessionPolicy: logicalPolicy, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  const framesBeforeSuspend = emulator.host.frames().length;
  emulator.host.input('\r');
  assert.equal((await running).status, 'completed');
  assert.equal(resumed, true);
  assert.ok(emulator.host.frames().length > framesBeforeSuspend);
  assert.equal(emulator.surfaceClears(), 0);
  assert.equal(emulator.mode(), 2);
  assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
  assert.equal(emulator.host.restores().at(-1).resultingState.cellPresentation, 'application-ordered');
  assert.deepEqual(emulator.host.output().match(/\u001B\[8[hl]/gu), ['\u001B[8l']);
});

for (const mode of [0, 3]) {
  test(`mapped session rejects resume when explicit presentation can no longer be established (mode ${mode})`, async () => {
    const emulator = modeHost();
    let resumed = false;
    const program = app({ update: state => ({
      state,
      effects: [{ id: 'external-mode-change', concurrency: 'keep-first', async run(context) {
        await context.withTerminalSuspended(async () => { emulator.setMode(mode); });
        resumed = true;
        return { kind: 'message', message: { kind: 'done' } };
      } }],
    }) });
    const running = runTui(program, { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' });
    await waitUntil(() => emulator.host.frames().length > 0);
    const framesBeforeSuspend = emulator.host.frames().length;
    emulator.host.input('\r');
    await assert.rejects(running, error => {
      assert.ok(error instanceof TuiRunError);
      const failure = error.exit.diagnostics.find(({ diagnostic }) =>
        diagnostic.data?.operation === 'cellPresentation' && diagnostic.data?.outcome === 'rejected')?.diagnostic;
      assert.ok(failure, 'resume retains the authoritative required-operation failure');
      assert.equal(error.primaryDiagnostic, failure);
      assert.ok(error.message.startsWith(failure.message));
      return true;
    });
    assert.equal(resumed, false);
    assert.equal(emulator.host.frames().length, framesBeforeSuspend);
    assert.equal(emulator.surfaceClears(), 1);
    assert.equal(emulator.mode(), mode);
    assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
    assert.equal(emulator.host.restores().at(-1).resultingState.bidiMode, mode === 0 ? 'unknown' : 'implicit');
    assert.deepEqual(emulator.host.output().match(/\u001B\[8[hl]/gu), ['\u001B[8l', '\u001B[8h']);
  });
}

test('surface reset follows explicit readback and occurs once before first frame', async () => {
  const emulator = modeHost();
  const running = runTui(app(), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  const output = emulator.host.output();
  const change = output.indexOf('\u001B[8l');
  const readback = output.indexOf('\u001B[8$p', change);
  const clear = output.indexOf('\u001B[2J');
  assert.ok(change >= 0 && readback > change && clear > readback);
  assert.equal(emulator.surfaceClears(), 1);
  emulator.host.input('\r');
  assert.equal((await running).status, 'completed');
  assert.equal(emulator.surfaceClears(), 1);
  assertRestored(emulator);
});

test('rejected presentation acquisition never clears the caller surface', async () => {
  const emulator = modeHost(0);
  await assert.rejects(runTui(app(), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' }), TuiRunError);
  assert.equal(emulator.surfaceClears(), 0);
  assert.equal(emulator.host.frames().length, 0);
  assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
  assert.equal(emulator.mode(), 0);
});

test('surface initialization write failure restores presentation without publishing a frame', async () => {
  const emulator = modeHost();
  const write = emulator.host.stdout.write.bind(emulator.host.stdout);
  emulator.host.stdout.write = (chunk, context) => {
    if (String(chunk) === '\u001B[2J') throw new Error('injected surface initialization failure');
    return write(chunk, context);
  };
  await assert.rejects(runTui(app(), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' }), TuiRunError);
  assert.equal(emulator.host.frames().length, 0);
  assertRestored(emulator);
});

test('required mode failure is the actionable primary error, including warning outcomes', async () => {
  const emulator = modeHost(0);
  await assert.rejects(runTui(app(), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' }), error => {
    assert.ok(error instanceof TuiRunError);
    const failure = error.exit.diagnostics.find(({ diagnostic }) =>
      diagnostic.data?.operation === 'cellPresentation' && diagnostic.data?.outcome === 'rejected').diagnostic;
    assert.equal(error.primaryDiagnostic, failure);
    assert.equal(error.cause, failure.cause);
    assert.equal(failure.data.requirement, 'required');
    assert.equal(failure.severity, 'warning');
    assert.ok(error.message.startsWith(failure.message));
    assert.ok(error.message.includes(failure.hint));
    assert.doesNotMatch(error.message, /^Required terminal session protocol setup failed/u);
    return true;
  });
  assert.equal(emulator.host.frames().length, 0);
  assert.equal(emulator.host.restores().at(-1).status, 'restored');
});

test('unrecognized alternate-screen query does not reject a working visual-cell session', async () => {
  const emulator = modeHost();
  const running = runTui(app(), { host: emulator.host, textPresentation,
    sessionPolicy: { ...sessionPolicy, alternateScreen: 'required' }, graphics: 'none' });
  await waitUntil(() => emulator.host.frames().length > 0);
  emulator.host.input('\r');
  assert.equal((await running).status, 'completed');
  assertRestored(emulator);
  assert.deepEqual(emulator.host.output().match(/\u001B\[\?1049[hl]/gu), ['\u001B[?1049h', '\u001B[?1049l']);
});

for (const mode of [2, 4]) {
  test(`explicit bidi-mode evidence alone cannot admit mapped application cells (mode ${mode})`, async () => {
    const emulator = modeHost(mode, null);
    let initialized = false;
    await assert.rejects(runTui(app({ init: () => {
      initialized = true;
      return { state: { value: 'unexpected' } };
    } }), { host: emulator.host, textPresentation, sessionPolicy, graphics: 'none' }), error => {
      assert.ok(error instanceof TuiRunError);
      assert.equal(error.primaryDiagnostic.code, 'HOST_CELL_PRESENTATION_UNQUALIFIED');
      assert.equal(error.primaryDiagnostic.data.operation, 'cellPresentation');
      assert.equal(error.primaryDiagnostic.data.outcome, 'rejected');
      return true;
    });
    assert.equal(initialized, false);
    assert.equal(emulator.host.frames().length, 0);
    assert.equal(emulator.surfaceClears(), 0);
    assert.equal(emulator.mode(), mode);
    assert.equal(emulator.host.stdin.isRawModeEnabled(), false);
  });
}
