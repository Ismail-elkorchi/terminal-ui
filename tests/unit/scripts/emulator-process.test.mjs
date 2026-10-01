import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { execute, waitForExit } from '../../../scripts/emulator/support/process.mjs';

test('graphics bootstrap gates probe import and hands off paused stdin with unchanged arguments', { timeout: 5_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-bootstrap-'));
  const probe = path.join(directory, 'probe with spaces.mjs');
  await fs.writeFile(probe, [
    "import process from 'node:process';",
    "console.log('PROBE_IMPORTED ' + JSON.stringify({ args: process.argv.slice(2), paused: process.stdin.isPaused(), listeners: process.stdin.listenerCount('data') }));",
    'process.stdin.unref();',
  ].join('\n'));
  const bootstrap = fileURLToPath(new URL('../../emulator/graphics-bootstrap.mjs', import.meta.url));
  const child = spawn(process.execPath, [bootstrap, probe, 'report with spaces.json', 'kitty', '--hold']);
  const ready = Promise.withResolvers();
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    if (stdout.includes('TERMINAL_UI_EMULATOR_BOOTSTRAP')) ready.resolve();
  });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.once('error', ready.reject);
  const closed = new Promise((resolve) => child.once('close', (code) => {
    ready.reject(new Error('Bootstrap exited before its readiness marker.'));
    resolve(code);
  }));
  try {
    await ready.promise;
    assert.match(stdout, /\u001b\[48;2;0;255;0mTERMINAL_UI_EMULATOR_BOOTSTRAP\u001b\[0m\n/u);
    assert.doesNotMatch(stdout, /PROBE_IMPORTED/u);
    child.stdin.write('\n');
    assert.equal(await closed, 0, stderr);
    const result = JSON.parse(stdout.split('PROBE_IMPORTED ')[1].trim());
    assert.deepEqual(result, { args: ['report with spaces.json', 'kitty', '--hold'], paused: true, listeners: 0 });
    assert.equal(stderr, '');
  } finally {
    child.kill('SIGKILL');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('emulator commands drain all output and retain failed-command stderr', async () => {
  const output = await execute(process.execPath, ['-e',
    "require('node:fs').writeSync(1, Buffer.alloc(256 * 1024, 120))"]);
  assert.equal(output.length, 256 * 1024);
  assert.equal(output.at(-1), 120);
  await assert.rejects(execute(process.execPath, ['-e',
    "process.stderr.write('emulator failure'); process.exitCode = 7"]), /exit 7: emulator failure/u);
});

test('emulator exit waits release listeners after success and timeout', async () => {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const pending = waitForExit(child, 5_000);
  child.emit('exit', 0, null);
  await pending;
  assert.equal(child.listenerCount('exit'), 0);
  await assert.rejects(waitForExit(child, 0), /did not exit/u);
  assert.equal(child.listenerCount('exit'), 0);
  child.signalCode = 'SIGTERM';
  await waitForExit(child, 5_000);
  assert.equal(child.listenerCount('exit'), 0);
});
