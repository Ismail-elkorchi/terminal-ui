import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../../jsr.json', import.meta.url), 'utf8'));

const npmEntrypoints = Object.keys(packageJson.exports)
  .filter((entrypoint) => !entrypoint.includes('*'))
  .sort();
const jsrEntrypoints = Object.keys(jsrJson.exports)
  .filter((entrypoint) => !entrypoint.startsWith('./schemas/'))
  .sort();

test('JSR manifest mirrors package identity and source entrypoints', () => {
  assert.equal(jsrJson.name, packageJson.name);
  assert.equal(jsrJson.version, packageJson.version);
  assert.equal(jsrJson.license, packageJson.license);

  assert.deepEqual(jsrEntrypoints, npmEntrypoints);
  for (const entrypoint of npmEntrypoints) {
    assert.match(jsrJson.exports[entrypoint], /^\.\/src\/.+\.ts$/u, entrypoint);
  }
});

test('JSR manifest exports concrete schema artifacts instead of dist wildcard only', () => {
  const schemaEntries = Object.keys(jsrJson.exports)
    .filter((entrypoint) => entrypoint.startsWith('./schemas/') && entrypoint.endsWith('.json'));
  assert.ok(schemaEntries.length > 0);
  for (const schemaEntry of schemaEntries) {
    assert.equal(jsrJson.exports[schemaEntry], schemaEntry, schemaEntry);
  }
});

test('JSR publication excludes source-owned test modules', () => {
  assert.deepEqual(jsrJson.publish?.exclude, ['src/**/*.test.ts']);
});
