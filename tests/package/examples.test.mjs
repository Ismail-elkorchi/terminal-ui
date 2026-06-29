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

test('showcase app renders a polished fullscreen preview in non-TTY mode', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/app.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control/u);
  assert.match(result.stdout, /Workspace/u);
  assert.match(result.stdout, /Inspector/u);
  assert.match(result.stdout, /Overview/u);
  assert.match(result.stdout, /harbor service/u);
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
  assert.match(result.stdout, /final inspector: render/u);
});

test('showcase visual preview exposes snapshot frame diff hit focus and accessibility evidence', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/preview.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control visual preview/u);
  assert.match(result.stdout, /schema: terminal-ui\.visual-snapshots\.v1/u);
  assert.match(result.stdout, /frame: 160x42/u);
  assert.match(result.stdout, /diff operations: \d+ fullRewrite=false/u);
  assert.match(result.stdout, /hit targets: \d+/u);
  assert.match(result.stdout, /accessibility root: application/u);
  assert.match(result.stdout, /Route map/u);
});
