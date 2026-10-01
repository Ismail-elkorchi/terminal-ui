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
  // Explicit executable overrides also let CI qualify pinned runtime versions.
  const executable = process.env[`TERMINAL_UI_${runtime.toUpperCase()}_EXECUTABLE`]
    ?? (runtime === 'node' ? process.execPath : runtime);
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  const skip = !unix ? 'Unix PTY coverage does not qualify Windows ConPTY.'
    : !python ? 'Python 3 with Unix PTY support is unavailable.'
      : version.status !== 0 ? `${runtime} is unavailable; no native ${runtime} coverage claimed.` : false;
  test(`native pending-read handoff and runTui suspension exit naturally under ${runtime}`, { skip, timeout: 90_000 }, async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `terminal-ui-handoff-${runtime}-`));
    context.diagnostic(version.stdout.trim());
    try {
      const result = await runPython([
        'tests/emulator/native-input-handoff-pty.py', `--runtime=${runtime}`, `--executable=${executable}`,
        `--output-directory=${directory}`,
      ]);
      assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}\nEvidence: ${directory}`);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.evidence, 'automated-unix-pty');
      assert.deepEqual(summary.cases.map(({ scenario }) => scenario), ['direct', 'visual', 'accessible']);
      assert.ok(summary.cases.every(({ cycles, naturalExit, termiosRestored, readableInputBytesAtExit }) =>
        cycles === 3 && naturalExit && termiosRestored && readableInputBytesAtExit === 0));
      assert.equal(summary.readinessObservation.preservedInput, 'keep\n');
      assert.equal(summary.readinessObservation.termiosRestored, true);
      assert.equal(summary.readinessObservation.persistentMismatchDetected, true);
      context.diagnostic(JSON.stringify({
        readinessObservation: summary.readinessObservation,
        termiosObservations: summary.cases.map(({ scenario, readableInputBytesAtExit, termiosObservation }) =>
          ({ scenario, readableInputBytesAtExit, ...termiosObservation })),
      }));
      await fs.rm(directory, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Native ${runtime} input handoff failed; artifacts retained in ${directory}`, { cause: error });
    }
  });
}

async function runPython(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn('python3', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGTERM'); }, 80_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}
