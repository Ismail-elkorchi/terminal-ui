import {
  createTranscriptRecorder,
  interactionTranscriptFormatVersion,
  replayTranscript,
  validateTranscript,
  type InteractionTranscript,
  type JsonValue,
  type TranscriptSource
} from '@ismail-elkorchi/terminal-ui/transcript';

const source: TranscriptSource = 'test';
const recorder = createTranscriptRecorder({ id: 'contract', source });
const transcript: InteractionTranscript = recorder.snapshot();
const validation = validateTranscript(transcript);
const message: JsonValue = { command: 'open', arguments: [1, true, null] };
recorder.record({ kind: 'message', source: 'external', fidelity: 'exact', message });
const formatVersion: 3 = interactionTranscriptFormatVersion;
const replayInput: Parameters<typeof replayTranscript>[1] = JSON.parse('{}') as unknown;

// @ts-expect-error recorded messages must be JSON-safe
recorder.record({ kind: 'message', source: 'external', fidelity: 'exact', message: () => undefined });

// @ts-expect-error transcript sources are a closed vocabulary
const invalidSource: TranscriptSource = 'runtime';

void validation;
void formatVersion;
void replayInput;
void invalidSource;
