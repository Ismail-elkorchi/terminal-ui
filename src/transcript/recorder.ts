import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptRecorder,
  TranscriptRecorderOptions
} from './types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';

export function createTranscriptRecorder(options: TranscriptRecorderOptions = {}): TranscriptRecorder {
  const steps: InteractionTranscriptStep[] = [];
  const diagnostics: TerminalDiagnostic[] = [];
  const redactions: TranscriptRedaction[] = [];
  return {
    record(step) {
      steps.push(step);
    },
    recordDiagnostic(item) {
      diagnostics.push(item);
      steps.push({ kind: 'diagnostic', diagnostic: item });
    },
    recordRedaction(redaction) {
      redactions.push(redaction);
    },
    snapshot(): InteractionTranscript {
      return {
        schemaVersion: 'terminal-ui.interaction-transcript.v1',
        id: options.id ?? 'transcript',
        source: options.source ?? 'test',
        startedAt: options.startedAt ?? new Date(0).toISOString(),
        steps: [...steps],
        diagnostics: [...diagnostics],
        redactions: [...redactions]
      };
    }
  };
}
