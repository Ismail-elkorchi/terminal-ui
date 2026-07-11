import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { createNodeTerminalHost } from '../../dist/host/index.js';

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
    stdout: { isTTY: true, columns: 80, rows: 24, write() {} },
    stderr: { isTTY: true, columns: 80, rows: 24, write() {} }
  });

  await host.dispose?.();

  assert.equal(unreferenced, true);
});
