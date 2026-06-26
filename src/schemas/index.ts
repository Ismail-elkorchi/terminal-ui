export interface SchemaArtifact {
  readonly path: string;
  readonly schemaVersion: string;
}

export const schemaArtifacts: readonly SchemaArtifact[] = [
  { path: './accessible-snapshot.schema.json', schemaVersion: 'terminal-ui.accessible-snapshot.v1' },
  { path: './interaction-transcript.schema.json', schemaVersion: 'terminal-ui.interaction-transcript.v1' },
  { path: './terminal-capabilities.schema.json', schemaVersion: 'terminal-ui.terminal-capabilities.v1' },
  { path: './terminal-diagnostic.schema.json', schemaVersion: 'terminal-ui.terminal-diagnostic.v1' },
  { path: './prompt-result.schema.json', schemaVersion: 'terminal-ui.prompt-result.v1' },
  { path: './shell-transcript.schema.json', schemaVersion: 'terminal-ui.shell-transcript.v1' },
  { path: './tui-frame.schema.json', schemaVersion: 'terminal-ui.tui-frame.v1' },
  { path: './render-diff.schema.json', schemaVersion: 'terminal-ui.render-diff.v1' }
];
