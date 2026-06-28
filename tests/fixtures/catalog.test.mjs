import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { requiredFixtureIds, terminalFixtures } from './catalog.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('fixture catalog covers every required product fixture family', () => {
  const ids = terminalFixtures.map((fixture) => fixture.id);

  assert.deepEqual([...new Set(ids)].sort(), [...ids].sort());
  assert.deepEqual(ids.sort(), [...requiredFixtureIds].sort());
  for (const fixture of terminalFixtures) {
    assert.equal(typeof fixture.id, 'string');
    assert.ok(fixture.data !== undefined);
  }
});

test('visual preview fixtures are generated from stable snapshot output', () => {
  const result = spawnSync(process.execPath, ['scripts/render-fixtures.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
