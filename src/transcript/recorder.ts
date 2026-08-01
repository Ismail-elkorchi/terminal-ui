import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptRecorder,
  TranscriptRecorderOptions
} from './types.ts';
import { interactionTranscriptFormatVersion } from './types.ts';
import { createDiagnosticOccurrenceReporter } from '../diagnostics.ts';
import { snapshotJsonValue, snapshotUnknownJsonValue } from '../foundation/json.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { Frame } from '../renderer/index.ts';

export function createTranscriptRecorder(options: TranscriptRecorderOptions = {}): TranscriptRecorder {
  const id = options.id ?? 'transcript';
  const steps: InteractionTranscriptStep[] = [];
  const diagnostics: DiagnosticOccurrence[] = [];
  const diagnosticIds = new Set<string>();
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  const redactions: TranscriptRedaction[] = [];
  return {
    record(step) {
      steps.push(recordedTranscriptStep(step));
    },
    recordMessage(source, message) {
      steps.push({ kind: 'message', source, message: snapshotUnknownJsonValue(message) });
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
        formatVersion: interactionTranscriptFormatVersion,
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
    steps.push({ kind: 'diagnostic', occurrence: item });
  }
}

function recordedTranscriptStep(step: InteractionTranscriptStep): InteractionTranscriptStep {
  switch (step.kind) {
    case 'commit':
      return {
        kind: 'commit',
        commit: {
          id: step.commit.id,
          stateVersion: step.commit.stateVersion,
          terminalSize: step.commit.terminalSize,
          ...(step.commit.focusPath === undefined ? {} : { focusPath: step.commit.focusPath }),
          frame: transcriptFrame(step.commit.frame),
          diff: step.commit.diff
        }
      };
    case 'input':
      return step;
    case 'message':
      return {
        kind: 'message',
        source: step.source,
        message: snapshotJsonValue(step.message, 'Transcript message')
      };
    case 'snapshot':
      return step;
    case 'diagnostic':
      return step;
    case 'restore':
      return step;
  }
}

function transcriptFrame(frame: Frame): Frame {
  return {
    width: frame.width,
    height: frame.height,
    widthProfile: frame.widthProfile,
    cells: frame.cells,
    ...(frame.hitTargets === undefined ? {} : { hitTargets: frame.hitTargets }),
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    accessibility: frame.accessibility
  };
}
