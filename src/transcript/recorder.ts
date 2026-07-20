import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptRecorder,
  TranscriptRecorderOptions
} from './types.ts';
import { createDiagnosticOccurrenceReporter } from '../diagnostics.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';

export function createTranscriptRecorder(options: TranscriptRecorderOptions = {}): TranscriptRecorder {
  const id = options.id ?? 'transcript';
  const steps: InteractionTranscriptStep[] = [];
  const diagnostics: DiagnosticOccurrence[] = [];
  const diagnosticIds = new Set<string>();
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  const redactions: TranscriptRedaction[] = [];
  return {
    record(step) {
      steps.push(step);
    },
    reportDiagnostic(item) {
      const occurrence = reporter.report(item);
      recordOccurrence(occurrence);
      return occurrence;
    },
    recordDiagnostic(item) {
      recordOccurrence(item);
    },
    recordRedaction(redaction) {
      redactions.push(redaction);
    },
    snapshot(): InteractionTranscript {
      return {
        schemaVersion: 'terminal-ui.interaction-transcript.v2',
        id,
        source: options.source ?? 'test',
        startedAt: options.startedAt ?? new Date(0).toISOString(),
        steps: [...steps],
        diagnostics: [...diagnostics],
        redactions: [...redactions]
      };
    }
  };

  function recordOccurrence(item: DiagnosticOccurrence): void {
    if (diagnosticIds.has(item.id)) return;
    diagnosticIds.add(item.id);
    diagnostics.push(item);
    steps.push({ kind: 'diagnostic', diagnostic: item });
  }
}
