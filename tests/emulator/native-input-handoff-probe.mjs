import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { textInputReducer } from '../../dist/behavior/index.js';
import { textInput } from '../../dist/components/index.js';
import { createTerminalHost } from '../../dist/host/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';

// This fixture deliberately never calls process.exit(): the PTY supervisor must
// observe normal event-loop shutdown, including all native stdin handles.
const [scenario, reportPath] = process.argv.slice(2);
const cycles = 3;
const host = createTerminalHost();
const record = (kind, details = {}) => {
  appendFileSync(reportPath, `${JSON.stringify({ kind, ...details })}\n`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (chunk) => typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

const childProgram = `
import json, os, sys, termios, tty
path, cycle = sys.argv[1], int(sys.argv[2])
def record(kind, **details):
    with open(path, 'a') as output:
        output.write(json.dumps(dict(kind=kind, cycle=cycle, **details)) + '\\n')
def snapshot(attributes):
    return dict(zip(['iflag', 'oflag', 'cflag', 'lflag', 'ispeed', 'ospeed', 'cc'],
                    [*attributes[:6], [value if isinstance(value, int) else value[0]
                                       for value in attributes[6]]]))
initial = termios.tcgetattr(0)
try:
    tty.setraw(0)
    record('child-ready', canonicalBefore=bool(initial[3] & termios.ICANON), termiosBefore=snapshot(initial))
    data = os.read(0, 1)
    record('child-input', data=data.decode('ascii'), length=len(data))
    assert data == b'C', repr(data)
finally:
    termios.tcsetattr(0, termios.TCSANOW, initial)
    record('child-restored', termiosAfter=snapshot(termios.tcgetattr(0)))
`;

async function externalOperation(cycle) {
  assert.equal(host.stdin.isRawModeEnabled(), false, 'Terminal raw mode remained enabled during handoff');
  record('operation-start', { cycle, rawMode: host.stdin.isRawModeEnabled() });
  await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', childProgram, reportPath, String(cycle)], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`Inherited-stdin child failed: code=${String(code)}, signal=${String(signal)}`));
    });
  });
  record('operation-complete', { cycle });
}

async function rawSession(id) {
  const session = await host.beginSession({ id });
  assert.equal((await session.enableRawInput()).status, 'applied');
  return session;
}

async function directHandoff() {
  try {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const session = await rawSession(`pending-${String(cycle)}`);
      const reader = host.stdin.read()[Symbol.asyncIterator]();
      let settled = false;
      const pending = reader.next().then((result) => { settled = true; return result; });
      await delay(30);
      assert.equal(settled, false, 'Native read unexpectedly settled before release');
      record('pending-read', { cycle });
      await host.stdin.release();
      assert.deepEqual(await pending, { done: true, value: undefined });
      record('reader-released', { cycle });
      assert.equal((await session.restore('success')).status, 'restored');
      await externalOperation(cycle);

      const replacementSession = await rawSession(`replacement-${String(cycle)}`);
      const replacement = host.stdin.read()[Symbol.asyncIterator]();
      const received = replacement.next();
      record('replacement-ready', { cycle });
      const result = await received;
      assert.equal(result.done, false, 'Reacquired native stdin returned EOF');
      assert.equal(decode(result.value.data), 'R');
      record('replacement-input', { cycle, data: decode(result.value.data) });
      await host.stdin.release();
      assert.equal((await replacementSession.restore('success')).status, 'restored');
    }
  } finally {
    await host.dispose();
  }
}

function readyEffect(state) {
  return [{
    id: `ready-${String(state.cycle)}-${state.phase}`,
    concurrency: 'parallel',
    async run() {
      record('ui-ready', { cycle: state.cycle, phase: state.phase, rawMode: host.stdin.isRawModeEnabled() });
      return { kind: 'none' };
    }
  }];
}

async function tuiHandoff(outputMode) {
  const app = defineTui({
    id: 'native-input-handoff',
    init: () => {
      const state = { cycle: 0, phase: 'ready', input: { text: '', cursor: 0 } };
      return { state, effects: readyEffect(state) };
    },
    update: (state, message) => {
      if (message.kind === 'start') {
        assert.equal(state.phase, 'ready');
        return {
          state: { ...state, phase: 'suspended' },
          effects: [{
            id: 'suspend-terminal',
            concurrency: 'keep-first',
            async run(context) {
              await context.withTerminalSuspended(() => externalOperation(state.cycle));
              return { kind: 'message', message: { kind: 'resumed' } };
            }
          }]
        };
      }
      if (message.kind === 'resumed') {
        const next = { ...state, phase: 'resumed' };
        return { state: next, effects: readyEffect(next) };
      }
      assert.equal(message.kind, 'input');
      assert.equal(state.phase, 'resumed', 'UI consumed input belonging to the external child');
      const input = textInputReducer(state.input, message.transition);
      assert.equal(input.text, 'R', 'Reacquired UI did not receive exactly the replacement sentinel');
      record('ui-input', { cycle: state.cycle, data: input.text });
      const next = { cycle: state.cycle + 1, phase: 'ready', input: { text: '', cursor: 0 } };
      return next.cycle === cycles
        ? { state: next, exit: { reason: 'handoff-complete' } }
        : { state: next, effects: readyEffect(next) };
    },
    view: (state) => textInput({
      id: 'handoff-input',
      meta: { accessibleName: 'Handoff input' },
      state: state.input,
      onTransition: (transition) => ({ kind: 'input', transition }),
      onSubmit: () => ({ kind: 'start' })
    })
  });
  const exit = await runTui(app, { host, outputMode });
  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'handoff-complete');
  assert.equal(exit.state.cycle, cycles);
  assert.equal(exit.diagnostics.some((item) => ['error', 'fatal'].includes(item.diagnostic.severity)), false);
  record('tui-complete', { status: exit.status, reason: exit.reason, cycles: exit.state.cycle });
}

try {
  record('started', { runtime: host.runtime, scenario, cycles });
  if (scenario === 'direct') await directHandoff();
  else await tuiHandoff(scenario);
  record('complete', { cycles });
} catch (error) {
  record('failure', { message: String(error), stack: error?.stack });
  console.error(error);
  process.exitCode = 1;
}
