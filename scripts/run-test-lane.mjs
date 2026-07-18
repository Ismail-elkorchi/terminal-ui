import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { discoverTestFiles, testLaneDirectories } from './test-discovery.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const lane = process.argv[2];
if (lane === undefined) throw new Error('A test lane is required.');

const files = await discoverTestFiles(testLaneDirectories(root, lane));
if (files.length === 0) throw new Error(`No tests found for lane: ${lane}`);

const paths = files.map((file) => relative(root, file));
const result = await run(process.execPath, ['--test', ...paths]);
process.exitCode = result;

function run(command, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => resolveResult(code ?? 1));
  });
}
