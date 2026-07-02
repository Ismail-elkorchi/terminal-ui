import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { exampleScripts } from './example-list.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

const structuredExampleScripts = new Set([
  'examples/showcase/app.mjs',
  'examples/showcase/scripted.mjs'
]);

for (const example of exampleScripts.filter((item) => !structuredExampleScripts.has(item))) {
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

test('showcase app renders a polished fullscreen preview in non-TTY mode', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/app.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control/u);
  assert.match(result.stdout, /Live harbor surface/u);
  assert.match(result.stdout, /Inspector/u);
  assert.match(result.stdout, /Overview/u);
  assert.match(result.stdout, /Atlas service/u);
  assert.doesNotMatch(result.stdout, /Render pipeline|Accessible snapshot|widget tree/u);
});

test('showcase scripted tour drives runtime frames diffs hit targets and route changes', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/scripted.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control scripted tour/u);
  assert.match(result.stdout, /frames: \d+/u);
  assert.match(result.stdout, /host frames: \d+/u);
  assert.match(result.stdout, /host diffs: \d+/u);
  assert.match(result.stdout, /input command: \/dispatch/u);
  assert.match(result.stdout, /hit targets: \d+/u);
  assert.match(result.stdout, /final route: activity/u);
  assert.match(result.stdout, /final inspector: event/u);
  assert.doesNotMatch(result.stdout, /Render pipeline|Accessible snapshot|widget tree/u);
});
