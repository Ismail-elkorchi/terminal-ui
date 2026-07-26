import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { globFiles } from '../../scripts/glob-files.mjs';
import { discoverTestFiles } from '../../scripts/test-discovery.mjs';

test('test discovery handles spaces, percent signs, extensions, and deterministic ordering', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'terminal ui %25 discovery '));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  await mkdir(join(directory, 'nested path'), { recursive: true });
  await mkdir(join(directory, 'nested path', '.hidden'), { recursive: true });
  const first = join(directory, 'nested path', 'a.test.ts');
  const second = join(directory, 'z.test.mjs');
  const hidden = join(directory, 'nested path', '.hidden', 'b.test.mjs');
  await writeFile(second, '');
  await writeFile(first, '');
  await writeFile(hidden, '');
  await writeFile(join(directory, 'ignored.test.js'), '');

  assert.deepEqual(
    await discoverTestFiles([directory]),
    [first, hidden, second].sort((left, right) => left.localeCompare(right))
  );
});

test('filesystem discovery keeps regular files and deduplicates overlapping roots', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'terminal ui glob files '));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const nested = join(directory, 'nested');
  await mkdir(nested, { recursive: true });
  await mkdir(join(directory, 'directory.test.ts'));
  await mkdir(join(directory, 'generated.ts'));
  await mkdir(join(directory, 'documentation.md'));
  const testFile = join(nested, 'actual.test.ts');
  const sourceFile = join(nested, 'actual.ts');
  const documentation = join(nested, 'actual.md');
  await writeFile(testFile, '');
  await writeFile(sourceFile, '');
  await writeFile(documentation, '');

  assert.deepEqual(
    await globFiles(directory, ['**/*.ts', '**/*.md']),
    [documentation, sourceFile, testFile].sort((left, right) => left.localeCompare(right))
  );
  assert.deepEqual(await discoverTestFiles([directory, nested]), [testFile]);
});
