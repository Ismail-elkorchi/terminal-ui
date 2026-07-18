import { schemaArtifacts, type SchemaArtifact } from '@ismail-elkorchi/terminal-ui/schemas';

const first: SchemaArtifact | undefined = schemaArtifacts[0];
const versions: readonly string[] = schemaArtifacts.map((artifact) => artifact.schemaVersion);

void first;
void versions;
