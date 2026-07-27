import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverTestFiles } from '../../scripts/test-discovery.mjs';

test('test discovery includes nested TypeScript and JavaScript suites', async () => {
  const root = await mkdtemp(join(tmpdir(), 'terminal-ui-test-discovery-'));
  try {
    const nested = join(root, 'owner', 'internal');
    await mkdir(nested, { recursive: true });
    await Promise.all([
      writeFile(join(root, 'root.test.mjs'), ''),
      writeFile(join(nested, 'nested.test.ts'), ''),
      writeFile(join(nested, 'not-a-test.ts'), '')
    ]);

    const files = await discoverTestFiles([root]);
    assert.deepEqual(files.map((file) => file.slice(root.length + 1).replaceAll('\\', '/')), [
      'owner/internal/nested.test.ts',
      'root.test.mjs'
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
