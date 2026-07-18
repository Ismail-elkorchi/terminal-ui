import {
  createTranscriptRecorder,
  validateTranscript,
  type InteractionTranscript,
  type TranscriptSource
} from '@ismail-elkorchi/terminal-ui/transcript';

const source: TranscriptSource = 'test';
const recorder = createTranscriptRecorder({ id: 'contract', source });
const transcript: InteractionTranscript = recorder.snapshot();
const validation = validateTranscript(transcript);

// @ts-expect-error transcript sources are a closed vocabulary
const invalidSource: TranscriptSource = 'runtime';

void validation;
void invalidSource;
