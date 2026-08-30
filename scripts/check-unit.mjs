import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles, testLaneDirectories } from './test-discovery.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = await discoverTestFiles(testLaneDirectories(root, 'unit'));
const testFiles = files.map((file) => relative(root, file));
const arguments_ = [
  '--experimental-test-coverage',
  '--test-coverage-include=dist/**/*.js',
  '--test-coverage-exclude=dist/**/*.test.js',
  '--test-coverage-lines=90',
  '--test-coverage-branches=80',
  '--test-coverage-functions=90',
  '--test',
  ...testFiles,
];

const code = await new Promise((resolveCode, reject) => {
  const child = spawn(process.execPath, arguments_, { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('close', (value) => resolveCode(value ?? 1));
});
process.exitCode = code;
