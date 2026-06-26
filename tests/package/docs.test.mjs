import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredDocs = [
  'docs/index.md',
  'docs/api/index.md',
  'docs/guides/runtime-support.md',
  'docs/guides/text.md',
  'docs/guides/prompts.md',
  'docs/guides/shell.md',
  'docs/guides/tui.md',
  'docs/guides/widgets.md',
  'docs/guides/host-adapters.md',
  'docs/accessibility.md',
  'docs/guides/transcript-replay.md',
  'docs/guides/non-tty.md',
  'docs/security.md',
  'docs/guides/testing-harness.md',
  'docs/guides/migration.md'
];

const executableExampleLinks = [
  'examples/prompts/non-tty-input.mjs',
  'examples/shell/cli-core-shell.mjs',
  'examples/tui/render-frame.mjs',
  'examples/testing/harness.mjs'
];

test('documentation covers required product guide families', async () => {
  for (const path of requiredDocs) {
    await access(new URL(`../../${path}`, import.meta.url));
  }

  const index = await readFile(new URL('../../docs/index.md', import.meta.url), 'utf8');
  for (const path of requiredDocs.slice(1)) {
    const relative = path.replace('docs/', './');
    assert.ok(index.includes(relative), path);
  }
});

test('documentation points to executable public examples and avoids workbench paths', async () => {
  const docs = await Promise.all(
    requiredDocs.map((path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
  );
  const combined = docs.join('\n');

  for (const path of executableExampleLinks) {
    assert.ok(combined.includes(path), path);
    await access(new URL(`../../${path}`, import.meta.url));
  }

  assert.equal(combined.includes('tse-workbench'), false);
  assert.equal(combined.includes('Documents/Projects'), false);
});
