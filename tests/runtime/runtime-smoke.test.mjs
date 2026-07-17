import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const runtimeSmokeScript = fileURLToPath(new URL('../../scripts/runtime-smoke.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const runtimeCommands = [
  {
    name: 'node',
    command: process.execPath,
    args: [runtimeSmokeScript]
  },
  {
    name: 'deno',
    command: 'deno',
    args: ['run', '--allow-read=dist,scripts', runtimeSmokeScript]
  },
  {
    name: 'bun',
    command: 'bun',
    args: [runtimeSmokeScript]
  }
];

for (const runtime of runtimeCommands) {
  test(`runtime smoke passes under ${runtime.name}`, async () => {
    const result = await runRuntimeSmoke(runtime.command, runtime.args);

    assert.equal(result.exitCode, 0, [
      `${runtime.name} runtime smoke failed.`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
    assert.match(result.stdout, new RegExp(`terminal-ui runtime smoke passed: ${runtime.name}`, 'u'));
  });
}

async function runRuntimeSmoke(command, args) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr.length === 0 ? '' : '\n'}${String(error.message)}`
      });
    });
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}
