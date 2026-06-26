import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../../jsr.json', import.meta.url), 'utf8'));

const npmToSourceEntries = new Map([
  ['.', './src/index.ts'],
  ['./host', './src/host/index.ts'],
  ['./input', './src/input/index.ts'],
  ['./protocol', './src/protocol/index.ts'],
  ['./text', './src/text/index.ts'],
  ['./theme', './src/theme/index.ts'],
  ['./prompts', './src/prompts/index.ts'],
  ['./shell', './src/shell/index.ts'],
  ['./tui', './src/tui/index.ts'],
  ['./widgets', './src/widgets/index.ts'],
  ['./accessibility', './src/accessibility/index.ts'],
  ['./transcript', './src/transcript/index.ts'],
  ['./testing', './src/testing/index.ts'],
  ['./schemas', './src/schemas/index.ts']
]);

const schemaEntries = [
  './schemas/accessible-snapshot.schema.json',
  './schemas/interaction-transcript.schema.json',
  './schemas/prompt-result.schema.json',
  './schemas/render-diff.schema.json',
  './schemas/shell-transcript.schema.json',
  './schemas/terminal-capabilities.schema.json',
  './schemas/terminal-diagnostic.schema.json',
  './schemas/tui-frame.schema.json'
];

test('JSR manifest mirrors package identity and source entrypoints', () => {
  assert.equal(jsrJson.name, packageJson.name);
  assert.equal(jsrJson.version, packageJson.version);
  assert.equal(jsrJson.license, packageJson.license);

  for (const [entrypoint, sourcePath] of npmToSourceEntries) {
    assert.ok(Object.hasOwn(packageJson.exports, entrypoint), entrypoint);
    assert.equal(jsrJson.exports[entrypoint], sourcePath, entrypoint);
  }
});

test('JSR manifest exports concrete schema artifacts instead of dist wildcard only', () => {
  for (const schemaEntry of schemaEntries) {
    assert.equal(jsrJson.exports[schemaEntry], schemaEntry, schemaEntry);
  }
});
