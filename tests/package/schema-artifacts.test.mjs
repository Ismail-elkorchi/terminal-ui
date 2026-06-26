import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { schemaArtifacts } from '../../dist/schemas/index.js';

const requiredArtifacts = new Map([
  ['./accessible-snapshot.schema.json', 'terminal-ui.accessible-snapshot.v1'],
  ['./interaction-transcript.schema.json', 'terminal-ui.interaction-transcript.v1'],
  ['./terminal-capabilities.schema.json', 'terminal-ui.terminal-capabilities.v1'],
  ['./terminal-diagnostic.schema.json', 'terminal-ui.terminal-diagnostic.v1'],
  ['./prompt-result.schema.json', 'terminal-ui.prompt-result.v1'],
  ['./shell-transcript.schema.json', 'terminal-ui.shell-transcript.v1'],
  ['./tui-frame.schema.json', 'terminal-ui.tui-frame.v1'],
  ['./render-diff.schema.json', 'terminal-ui.render-diff.v1']
]);

test('schema catalog exposes every product machine-readable artifact', async () => {
  assert.deepEqual(new Map(schemaArtifacts.map((artifact) => [artifact.path, artifact.schemaVersion])), requiredArtifacts);

  for (const [path, schemaVersion] of requiredArtifacts) {
    const schema = JSON.parse(await readFile(new URL(`../../dist/schemas/${path.slice(2)}`, import.meta.url), 'utf8'));
    assertSchemaVersionRequired(schema, schemaVersion, path);
  }
});

function assertSchemaVersionRequired(schema, schemaVersion, path) {
  if (Array.isArray(schema.oneOf)) {
    for (const branch of schema.oneOf) assertSchemaVersionRequired(branch, schemaVersion, path);
    return;
  }
  assert.equal(schema.properties.schemaVersion.const, schemaVersion, path);
  assert.ok(schema.required.includes('schemaVersion'), path);
}
