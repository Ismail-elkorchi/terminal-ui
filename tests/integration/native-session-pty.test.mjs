import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const unix = process.platform !== 'win32';
const python = unix && spawnSync('python3', ['-c', 'import pty, termios, fcntl'], { encoding: 'utf8' }).status === 0;

for (const runtime of ['node', 'deno', 'bun']) {
  const executable = runtime === 'node' ? process.execPath : runtime;
  const available = spawnSync(executable, ['--version'], { encoding: 'utf8' }).status === 0;
  const skip = !unix ? 'Unix PTY test does not qualify Windows ConPTY; use the native interactive runner.'
    : !python ? 'Python 3 with Unix PTY support is unavailable.'
      : !available ? `${runtime} is unavailable; no native ${runtime} coverage claimed.` : false;
  test(`real Unix PTY input, resize, cancellation and restoration under ${runtime}`, { skip, timeout: 180_000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `terminal-ui-native-${runtime}-`));
    try {
      const result = await runPython([
        'tests/emulator/native-session-pty.py', `--runtime=${runtime}`, `--executable=${executable}`,
        `--output-directory=${directory}`,
      ]);
      assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}\nEvidence: ${directory}`);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.evidence, 'automated-unix-pty');
      assert.equal(summary.cases.length, 8);
      assert.ok(summary.cases.every(({ termiosRestored }) => termiosRestored));
      await fs.rm(directory, { recursive: true, force: true });
    } catch (error) {
      // Keep failed native process evidence available rather than discarding the useful failure.
      throw new Error(`Native ${runtime} qualification failed; artifacts retained in ${directory}`, { cause: error });
    }
  });
}

async function runPython(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn('python3', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGTERM'); }, 170_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}
