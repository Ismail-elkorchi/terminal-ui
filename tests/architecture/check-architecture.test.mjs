import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const checkerPath = path.join(repositoryRoot, 'scripts/check-architecture.mjs');

test('architecture checker rejects authority, determinism, and dependency-cycle violations', async () => {
  const result = await checkFixture('rejected');
  assert.notEqual(result.code, 0, 'rejected architecture fixture unexpectedly passed');
  assert.match(result.output, /imports forbidden host type dependency/u);
  assert.match(result.output, /imports forbidden host dynamic dependency/u);
  assert.match(result.output, /calls nondeterministic runtime API Date\.now/u);
  assert.match(result.output, /runtime dependency cycle/u);
  assert.match(result.output, /type dependency cycle crosses architecture boundaries/u);
  assert.match(result.output, /imports itself/u);
});

async function checkFixture(name) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'terminal-ui-architecture-'));
  try {
    await Promise.all([
      cp(path.join(repositoryRoot, 'src'), path.join(projectRoot, 'src'), { recursive: true }),
      cp(path.join(repositoryRoot, 'dist'), path.join(projectRoot, 'dist'), { recursive: true }),
      copyFile(path.join(repositoryRoot, 'package.json'), path.join(projectRoot, 'package.json')),
      copyFile(path.join(repositoryRoot, 'tsconfig.json'), path.join(projectRoot, 'tsconfig.json')),
      symlink(path.join(repositoryRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir'),
    ]);
    await cp(
      path.join(repositoryRoot, 'tests/fixtures/architecture', name),
      projectRoot,
      { recursive: true },
    );
    return await run(process.execPath, [checkerPath, '--project-root', projectRoot]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: repositoryRoot });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}
