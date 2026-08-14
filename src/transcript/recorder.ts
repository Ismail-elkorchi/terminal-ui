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
import type { FrameDescriptor } from '../renderer/index.ts';
import { isCanonicalDateTime } from '../foundation/validation.ts';
import { snapshotInputEvent } from '../input/index.ts';
import { decodeAccessibleSnapshot } from '../accessibility/index.ts';

export function createTranscriptRecorder(options: TranscriptRecorderOptions = {}): TranscriptRecorder {
  const { id: suppliedId, source = 'test', startedAt = new Date(0).toISOString() } = options;
  if (!isCanonicalDateTime(startedAt)) {
    throw new TypeError('Transcript startedAt must be a canonical ISO 8601 date-time.');
  }
  const id = suppliedId ?? 'transcript';
  const steps: InteractionTranscriptStep[] = [];
  const retainedStepLimit = retentionLimit(options.retention);
  if (options.onStep !== undefined && typeof options.onStep !== 'function') {
    throw new TypeError('Transcript onStep must be a function.');
  }
  let omittedSteps = 0;
  let oldestStepIndex = 0;
  const diagnostics: DiagnosticOccurrence[] = [];
  const diagnosticIds = new Set<string>();
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  const redactions: TranscriptRedaction[] = [];
  return {
    record(step) {
      appendStep(recordedTranscriptStep(step));
    },
    recordNormalizedMessage(source, message) {
      appendStep(Object.freeze({
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
        steps: orderedSteps(),
        omittedSteps,
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
    appendStep(Object.freeze({ kind: 'diagnostic', occurrence: item }));
  }

  function appendStep(step: InteractionTranscriptStep): void {
    options.onStep?.(step);
    if (retainedStepLimit === 0) {
      omittedSteps += 1;
      return;
    }
    if (!Number.isFinite(retainedStepLimit) || steps.length < retainedStepLimit) {
      steps.push(step);
      return;
    }
    steps[oldestStepIndex] = step;
    oldestStepIndex = (oldestStepIndex + 1) % retainedStepLimit;
    omittedSteps += 1;
  }

  function orderedSteps(): readonly InteractionTranscriptStep[] {
    if (oldestStepIndex === 0 || steps.length < retainedStepLimit) {
      return Object.freeze([...steps]);
    }
    return Object.freeze([
      ...steps.slice(oldestStepIndex),
      ...steps.slice(0, oldestStepIndex),
    ]);
  }
}

function retentionLimit(retention: TranscriptRecorderOptions['retention']): number {
  if (retention === undefined || retention.kind === 'all') return Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(retention.limit) || retention.limit < 0) {
    throw new RangeError('Transcript retained step limit must be a non-negative safe integer.');
  }
  return retention.limit;
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
    case 'snapshot': {
      const snapshot = decodeAccessibleSnapshot(step.snapshot);
      if (!snapshot.ok) throw new TypeError(snapshot.error.message);
      return Object.freeze({ kind: 'snapshot', snapshot: snapshot.value });
    }
    case 'diagnostic':
      return Object.freeze({ kind: 'diagnostic', occurrence: adoptDiagnosticOccurrence(step.occurrence) });
    case 'restore':
      return snapshotCanonicalJsonValue(step, 'Transcript restore step');
  }
}

function transcriptFrame(frame: FrameDescriptor): FrameDescriptor {
  return {
    width: frame.width,
    height: frame.height,
    widthProfile: frame.widthProfile,
    ...(frame.canvasStyle === undefined ? {} : { canvasStyle: frame.canvasStyle }),
    cells: frame.cells,
    graphics: frame.graphics.map((placement) => ({
      ...placement,
      image: { ...placement.image }
    })),
    ...(frame.hitTargets === undefined ? {} : { hitTargets: frame.hitTargets }),
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    accessibility: frame.accessibility
  };
}
