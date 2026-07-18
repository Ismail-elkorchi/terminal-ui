const schemaSpecifiers = [
  '@ismail-elkorchi/terminal-ui/schemas/accessible-snapshot.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/interaction-transcript.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/prompt-result.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/render-diff.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/terminal-capabilities.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/terminal-diagnostic.schema.json',
  '@ismail-elkorchi/terminal-ui/schemas/tui-frame.schema.json'
];

const ids = [];
for (const specifier of schemaSpecifiers) {
  const imported = await import(specifier, { with: { type: 'json' } });
  const schema = imported.default;
  if (typeof schema?.$id !== 'string' || schema.$id.length === 0) {
    throw new Error(`Schema ${specifier} does not expose a stable $id.`);
  }
  ids.push(schema.$id);
}

if (new Set(ids).size !== schemaSpecifiers.length) {
  throw new Error('Published schema ids must be unique.');
}

console.log(JSON.stringify({ scenario: 'schema-artifacts', ok: true }));
