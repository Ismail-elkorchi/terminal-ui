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
const commit = transcript.steps.find((step) => step.kind === 'commit');

// @ts-expect-error transcript sources are a closed vocabulary
const invalidSource: TranscriptSource = 'runtime';
if (commit?.kind === 'commit') {
  // @ts-expect-error transcript commits no longer call terminal dimensions a viewport
  const removedViewport = commit.commit.viewport;
  void removedViewport;
}

void validation;
void invalidSource;
