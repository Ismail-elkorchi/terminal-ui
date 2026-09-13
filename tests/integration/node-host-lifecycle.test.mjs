import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createNodeTerminalHost } from '../../dist/host/index.js';
import { button } from '../../dist/components/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';

for (const term of ['tmux-256color', 'xterm-256color']) {
  test(`native Node session preserves ${term} evidence after incomplete mode replies`, { timeout: 5_000 }, async () => {
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.isRaw = false;
    const rawModes = [];
    stdin.setRawMode = (enabled) => { stdin.isRaw = enabled; rawModes.push(enabled); };
    const output = [];
    let submitted = false;
    const stdout = {
      ...immediateNodeOutput(),
      write(chunk, callback) {
        const value = String(chunk);
        output.push(value);
        if (value.includes('\u001b[c')) {
          setImmediate(() => stdin.write('\u001b[?1;2c'));
        }
        if (!submitted && value.includes('Close')) {
          submitted = true;
          setImmediate(() => stdin.write('\r'));
        }
        callback();
        return true;
      },
    };
    const host = createNodeTerminalHost({ stdin, stdout, stderr: immediateNodeOutput(), env: { TERM: term } });
    const app = defineTui({
      id: 'native-session', init: () => ({ state: false }),
      update: () => ({ state: true, exit: {} }),
      view: () => button({ id: 'close', label: 'Close', onPress: () => 'close' }),
    });
    try {
      const before = await host.getCapabilities();
      const result = await runTui(app, { host });
      assert.equal(result.status, 'completed');
      const after = await host.getCapabilities();
      for (const name of ['alternateScreen', 'cursorVisibility', 'mouseReporting']) {
        assert.equal(before[name].support, 'supported');
        assert.equal(after[name].support, 'supported');
      }
      assert.equal(stdin.isRaw, false);
      assert.ok(rawModes.includes(true));
      assert.equal(rawModes.at(-1), false);
      assert.match(output.join(''), /\u001b\[\?1049h/u);
      assert.match(output.join(''), /\u001b\[\?1049l/u);
      assert.match(output.join(''), /\u001b\[\?25h/u);
      stdin.write('next reader');
      const reader = host.stdin.read()[Symbol.asyncIterator]();
      assert.equal(new TextDecoder().decode((await reader.next()).value.data), 'next reader');
      await reader.return();
    } finally {
      await host.dispose();
      stdin.destroy();
    }
  });
}

test('disposing a Node host releases stdin activated by terminal input reads', async () => {
  const script = [
    "import { createNodeTerminalHost } from './dist/host/index.js';",
    'const host = createNodeTerminalHost();',
    'void host.stdin.read()[Symbol.asyncIterator]().next();',
    "setTimeout(async () => { await host.dispose?.(); console.log('disposed'); }, 20);"
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  let timeout;
  const result = await Promise.race([
    new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(undefined), 2_000);
    })
  ]);
  clearTimeout(timeout);
  if (result === undefined) child.kill('SIGKILL');

  assert.notEqual(result, undefined, `child did not exit after host disposal; stderr=${stderr.join('')}`);
  assert.deepEqual(result, { code: 0, signal: null });
  assert.match(stdout.join(''), /disposed/u);
});

test('disposing a Node host unreferences its input stream', async () => {
  let unreferenced = false;
  const stream = {
    isTTY: true,
    async *[Symbol.asyncIterator]() {},
    pause() {},
    unref() {
      unreferenced = true;
    }
  };
  const host = createNodeTerminalHost({
    stdin: stream,
    stdout: immediateNodeOutput(),
    stderr: immediateNodeOutput()
  });

  await host.dispose?.();

  assert.equal(unreferenced, true);
});

function immediateNodeOutput() {
  return {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(_chunk, callback) {
      callback();
      return true;
    },
    once() {},
    off() {}
  };
}
