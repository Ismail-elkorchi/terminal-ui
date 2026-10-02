import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/package/grapheme-windows.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const runtimeCommands = [
  { name: 'node', command: process.execPath, args: [script] },
  { name: 'deno', command: 'deno', args: ['run', '--allow-read=dist,scripts', script] },
  { name: 'bun', command: 'bun', args: [script] },
];

for (const runtime of runtimeCommands) {
  test(`bounded grapheme windows match native segmentation under ${runtime.name}`, async () => {
    const result = await runRuntime(runtime.command, runtime.args);
    assert.equal(result.exitCode, 0, [
      `${runtime.name} grapheme-window differential test failed.`, result.stdout, result.stderr,
    ].filter(Boolean).join('\n'));
    assert.match(result.stdout, new RegExp(`terminal-ui grapheme windows passed: ${runtime.name}`, 'u'));
  });
}

async function runRuntime(command, args) {
  return await new Promise(resolve => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${stderr.length === 0 ? '' : '\n'}${String(error.message)}` });
    });
    child.on('close', code => { resolve({ exitCode: code ?? 1, stdout, stderr }); });
  });
}
