import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import { execute, waitForExit } from '../../../scripts/emulator/support/process.mjs';

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
