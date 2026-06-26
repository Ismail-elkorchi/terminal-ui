import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const examples = [
  'examples/prompts/non-tty-input.mjs',
  'examples/shell/cli-core-shell.mjs',
  'examples/tui/render-frame.mjs',
  'examples/testing/harness.mjs'
];

for (const example of examples) {
  test(`example runs: ${example}`, () => {
    const result = spawnSync(process.execPath, [example], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.notEqual(result.stdout.trim(), '');
  });
}
