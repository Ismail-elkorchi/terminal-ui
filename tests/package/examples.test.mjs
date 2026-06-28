import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { exampleScripts } from './example-list.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

for (const example of exampleScripts) {
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

test('monitoring console example demonstrates state-driven spinner progression', () => {
  const result = spawnSync(process.execPath, ['examples/tui/monitoring-console.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Frame 0/u);
  assert.match(result.stdout, /Frame 1/u);
  assert.match(result.stdout, /Frame 2/u);
  assert.match(result.stdout, /⠋ Refreshing telemetry/u);
  assert.match(result.stdout, /⠙ Refreshing telemetry/u);
  assert.match(result.stdout, /⠹ Refreshing telemetry/u);
});
