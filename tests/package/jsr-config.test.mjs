import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../../jsr.json', import.meta.url), 'utf8'));
const repositoryRoot = new URL('../../', import.meta.url);

const npmEntrypoints = Object.keys(packageJson.exports)
  .filter((entrypoint) => !entrypoint.includes('*'))
  .sort();
const jsrEntrypoints = Object.keys(jsrJson.exports)
  .filter((entrypoint) => !entrypoint.startsWith('./schemas/'))
  .sort();

test('JSR manifest mirrors package identity and source entrypoints', async () => {
  assert.equal(jsrJson.name, packageJson.name);
  assert.equal(jsrJson.version, packageJson.version);
  assert.equal(jsrJson.license, packageJson.license);

  assert.deepEqual(jsrEntrypoints, npmEntrypoints);
  for (const entrypoint of npmEntrypoints) {
    const source = jsrJson.exports[entrypoint];
    assert.match(source, /^\.\/src\/.+\.ts$/u, entrypoint);
    await access(new URL(source.slice(2), repositoryRoot));

    const npmExport = packageJson.exports[entrypoint];
    assert.equal(typeof npmExport?.types, 'string', `${entrypoint} declarations`);
    assert.equal(typeof npmExport?.default, 'string', `${entrypoint} runtime`);
  }
});

test('JSR manifest exports every concrete schema artifact', async () => {
  const schemaEntries = Object.keys(jsrJson.exports)
    .filter((entrypoint) => entrypoint.startsWith('./schemas/') && entrypoint.endsWith('.json'))
    .sort();
  const schemaFiles = (await readdir(new URL('../../schemas/', import.meta.url)))
    .filter((name) => name.endsWith('.json'))
    .sort();

  assert.deepEqual(
    schemaEntries.map((entrypoint) => entrypoint.slice('./schemas/'.length)),
    schemaFiles
  );
  for (const schemaEntry of schemaEntries) {
    assert.equal(jsrJson.exports[schemaEntry], schemaEntry, schemaEntry);
  }
  assert.deepEqual(packageJson.exports['./schemas/*.json'], {
    default: './dist/schemas/*.json'
  });
});

test('JSR publication excludes source-local test modules', () => {
  assert.deepEqual(jsrJson.publish?.exclude, ['src/**/*.test.ts']);
});
