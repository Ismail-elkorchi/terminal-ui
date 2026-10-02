import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFile, cp, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises';
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
  assert.match(result.output, /imports public facade text\/index\.ts/u);
  assert.match(result.output, /type dependency cycle:.*foundation/u);
  assert.match(result.output, /creates a raw timer/u);
  assert.match(result.output, /calls nondeterministic runtime API Math\.random/u);
  assert.match(result.output, /imports forbidden host runtime dependency/u);
  assert.match(result.output, /imports forbidden foundation runtime dependency/u);
  assert.match(result.output, /primitive validation must remain dependency-free/u);
});

test('architecture checker accepts permitted dependencies and shadowed ambient names', async () => {
  const result = await checkFixture('accepted');
  assert.equal(result.code, 0, result.output);
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
    if (name === 'rejected') {
      await appendFile(path.join(projectRoot, 'src/foundation/validation.ts'), '\nimport "./runtime-cycle-a.ts";\n');
    }
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

test('focused foundations import loads only its implementation dependencies', async () => {
  const result = await run(process.execPath, ['--input-type=module', '--eval', `
    import { registerHooks } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const root = pathToFileURL(path.join(process.cwd(), 'dist') + path.sep).href;
    const loaded = new Set();
    registerHooks({ load(url, context, nextLoad) {
      if (url.startsWith(root)) loaded.add(url.slice(root.length));
      return nextLoad(url, context);
    } });
    await import('@ismail-elkorchi/terminal-ui/components/foundations');
    console.log(JSON.stringify([...loaded]));
  `]);
  assert.equal(result.code, 0, result.output);
  const loaded = JSON.parse(result.output);
  assert.ok(loaded.length <= 70, `foundations loaded ${loaded.length} modules: ${loaded.join(', ')}`);
  for (const unrelated of [
    'text/document.js', 'text/document-edit.js', 'text/edit-history.js', 'text/query.js',
    'renderer/internal/render-element.js',
  ]) assert.ok(!loaded.includes(unrelated), `foundations loaded ${unrelated}`);
});
