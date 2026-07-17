import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await fs.readFile(new URL('../jsr.json', import.meta.url), 'utf8'));

assert.equal(jsrJson.name, packageJson.name, 'npm and JSR package names must match.');
assert.equal(jsrJson.version, packageJson.version, 'npm and JSR package versions must match.');

const npmEntrypoints = Object.keys(packageJson.exports)
  .filter((entrypoint) => !entrypoint.includes('*'))
  .sort();
const jsrEntrypoints = Object.keys(jsrJson.exports)
  .filter((entrypoint) => !entrypoint.startsWith('./schemas/'))
  .sort();
assert.deepEqual(jsrEntrypoints, npmEntrypoints, 'npm exports are the authoritative public entrypoint set.');

for (const entrypoint of npmEntrypoints) {
  const source = jsrJson.exports[entrypoint];
  assert.equal(typeof source, 'string', `JSR entrypoint ${entrypoint} must map to one source module.`);
  await fs.access(new URL(`..${source.slice(1)}`, import.meta.url));

  const npmExport = packageJson.exports[entrypoint];
  assert.equal(typeof npmExport?.types, 'string', `npm entrypoint ${entrypoint} must expose declarations.`);
  assert.equal(typeof npmExport?.default, 'string', `npm entrypoint ${entrypoint} must expose runtime code.`);
}

const npmSchemaPattern = packageJson.exports['./schemas/*.json'];
assert.deepEqual(npmSchemaPattern, { default: './dist/schemas/*.json' });
const schemaFiles = (await fs.readdir(new URL('../schemas/', import.meta.url)))
  .filter((name) => name.endsWith('.json'))
  .sort();
const jsrSchemaFiles = Object.keys(jsrJson.exports)
  .filter((entrypoint) => entrypoint.startsWith('./schemas/') && entrypoint.endsWith('.json'))
  .map((entrypoint) => entrypoint.slice('./schemas/'.length))
  .sort();
assert.deepEqual(jsrSchemaFiles, schemaFiles, 'JSR schema exports must cover every canonical schema file.');
