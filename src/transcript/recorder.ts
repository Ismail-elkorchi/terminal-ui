import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptRecorder,
  TranscriptRecorderOptions
} from './types.ts';
import { interactionTranscriptFormatVersion } from './types.ts';
import {
  adoptDiagnosticOccurrence,
  createDiagnosticOccurrenceReporter
} from '../diagnostics.ts';
import { snapshotCanonicalJsonValue, snapshotUnknownJsonValue } from '../foundation/json.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { Frame } from '../renderer/index.ts';
import { isCanonicalDateTime } from '../foundation/validation.ts';
import { snapshotInputEvent } from '../input/index.ts';

export function createTranscriptRecorder(options: TranscriptRecorderOptions = {}): TranscriptRecorder {
  const { id: suppliedId, source = 'test', startedAt = new Date(0).toISOString() } = options;
  if (!isCanonicalDateTime(startedAt)) {
    throw new TypeError('Transcript startedAt must be a canonical ISO 8601 date-time.');
  }
  const id = suppliedId ?? 'transcript';
  const steps: InteractionTranscriptStep[] = [];
  const diagnostics: DiagnosticOccurrence[] = [];
  const diagnosticIds = new Set<string>();
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  const redactions: TranscriptRedaction[] = [];
  return {
    record(step) {
      steps.push(recordedTranscriptStep(step));
    },
    recordNormalizedMessage(source, message) {
      steps.push(Object.freeze({
        kind: 'message',
        source,
        fidelity: 'normalized',
        message: snapshotUnknownJsonValue(message)
      }));
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
      redactions.push(snapshotCanonicalJsonValue(redaction, 'Transcript redaction'));
    },
    snapshot(): InteractionTranscript {
      return Object.freeze({
        formatVersion: interactionTranscriptFormatVersion,
        id,
        source,
        startedAt,
        steps: Object.freeze([...steps]),
        diagnostics: Object.freeze([...diagnostics]),
        redactions: Object.freeze([...redactions])
      });
    }
  };

  function recordOccurrence(value: DiagnosticOccurrence): void {
    const item = adoptDiagnosticOccurrence(value);
    if (diagnosticIds.has(item.id)) return;
    diagnosticIds.add(item.id);
    diagnostics.push(item);
    steps.push(Object.freeze({ kind: 'diagnostic', occurrence: item }));
  }
}

function recordedTranscriptStep(step: InteractionTranscriptStep): InteractionTranscriptStep {
  switch (step.kind) {
    case 'commit':
      return snapshotCanonicalJsonValue({
        kind: 'commit',
        commit: {
          id: step.commit.id,
          stateVersion: step.commit.stateVersion,
          terminalSize: step.commit.terminalSize,
          ...(step.commit.focusPath === undefined ? {} : { focusPath: step.commit.focusPath }),
          frame: transcriptFrame(step.commit.frame),
          diff: step.commit.diff
        }
      } as const, 'Transcript commit step');
    case 'input':
      return Object.freeze({ kind: 'input', event: snapshotInputEvent(step.event) });
    case 'message':
      return snapshotCanonicalJsonValue({
        kind: 'message',
        source: step.source,
        fidelity: step.fidelity,
        message: step.message
      } as const, 'Transcript message step');
    case 'snapshot':
      return snapshotCanonicalJsonValue(step, 'Transcript accessibility snapshot step');
    case 'diagnostic':
      return Object.freeze({ kind: 'diagnostic', occurrence: adoptDiagnosticOccurrence(step.occurrence) });
    case 'restore':
      return snapshotCanonicalJsonValue(step, 'Transcript restore step');
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
