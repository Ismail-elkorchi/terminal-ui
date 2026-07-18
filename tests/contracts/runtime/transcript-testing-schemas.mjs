import { schemaArtifacts } from '@ismail-elkorchi/terminal-ui/schemas';
import { createTerminalHarness } from '@ismail-elkorchi/terminal-ui/testing';
import { createTranscriptRecorder, validateTranscript } from '@ismail-elkorchi/terminal-ui/transcript';

const recorder = createTranscriptRecorder({ id: 'portable', source: 'test' });
recorder.record({ kind: 'input', event: { kind: 'text', text: 'x', paste: false } });
const transcript = recorder.snapshot();
const validation = validateTranscript(transcript);
const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });

await harness.input('x');

invariant(validation.ok, 'transcript validation failed');
invariant(transcript.steps.length === 1, 'transcript recording failed');
invariant(harness.transcript.snapshot().steps.length === 1, 'testing harness recording failed');
invariant(schemaArtifacts.length >= 7, 'schema artifact catalog is incomplete');

console.log(JSON.stringify({ scenario: 'transcript-testing-schemas', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
