import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

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
