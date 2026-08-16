import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptRecorder,
  TranscriptRecorderOptions,
  TranscriptRetentionPolicy
} from './types.ts';
import { interactionTranscriptFormatVersion } from './types.ts';
import {
  adoptDiagnosticOccurrence,
  createDiagnosticOccurrenceReporter,
  diagnostic
} from '../diagnostics.ts';
import { snapshotCanonicalJsonValue, snapshotUnknownJsonValue } from '../foundation/json.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { FrameDescriptor } from '../renderer/index.ts';
import { isCanonicalDateTime } from '../foundation/validation.ts';
import { snapshotInputEvent } from '../input/index.ts';
import { decodeAccessibleSnapshot } from '../accessibility/index.ts';
import { isNonArrayObject, isStringMember } from '../foundation/validation.ts';
import { transcriptSources } from './types.ts';

export const defaultTranscriptRetentionPolicy: Readonly<Required<TranscriptRetentionPolicy>> = Object.freeze({
  maxSteps: 10_000,
  maxDiagnostics: 1_000,
  maxRedactions: 1_000
});

export function createTranscriptRecorder(options?: TranscriptRecorderOptions): TranscriptRecorder;
export function createTranscriptRecorder(value: unknown = {}): TranscriptRecorder {
  if (!isNonArrayObject(value)) throw new TypeError('Transcript recorder options must be an object.');
  const options = value;
  const sourceValue = options['source'] ?? 'test';
  if (!isStringMember(sourceValue, transcriptSources)) {
    throw new TypeError('Transcript source is invalid.');
  }
  const suppliedIdValue = options['id'];
  if (suppliedIdValue !== undefined && (typeof suppliedIdValue !== 'string' || suppliedIdValue.trim() === '')) {
    throw new TypeError('Transcript id must be a non-empty string when provided.');
  }
  const startedAtValue = options['startedAt'] ?? new Date(0).toISOString();
  if (typeof startedAtValue !== 'string') throw new TypeError('Transcript startedAt must be a string.');
  const onStep = options['onStep'];
  if (onStep !== undefined && typeof onStep !== 'function') {
    throw new TypeError('Transcript onStep must be a function.');
  }
  const retention = prepareRetention(options['retention']);
  const suppliedOptions = {
    id: suppliedIdValue,
    source: sourceValue,
    startedAt: startedAtValue,
    onStep: onStep as TranscriptRecorderOptions['onStep']
  };
  const { id: suppliedId, source, startedAt } = suppliedOptions;
  if (!isCanonicalDateTime(startedAt)) {
    throw new TypeError('Transcript startedAt must be a canonical ISO 8601 date-time.');
  }
  const id = suppliedId ?? 'transcript';
  const steps: InteractionTranscriptStep[] = [];
  const retainedStepLimit = retention.maxSteps;
  let omittedSteps = 0;
  let oldestStepIndex = 0;
  const diagnostics: DiagnosticOccurrence[] = [];
  const diagnosticIds = new Set<string>();
  const diagnosticStepIds = new Set<string>();
  let omittedDiagnostics = 0;
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  const redactions: TranscriptRedaction[] = [];
  let omittedRedactions = 0;
  return {
    record(step) {
      const recorded = recordedTranscriptStep(step);
      if (recorded.kind === 'diagnostic') recordOccurrence(recorded.occurrence);
      else appendStep(recorded);
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
      const item = snapshotCanonicalJsonValue(redaction, 'Transcript redaction');
      if (retention.maxRedactions === 0) {
        omittedRedactions += 1;
      } else {
        if (redactions.length === retention.maxRedactions) {
          redactions.shift();
          omittedRedactions += 1;
        }
        redactions.push(item);
      }
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
        omittedDiagnostics,
        redactions: Object.freeze([...redactions]),
        omittedRedactions
      });
    }
  };

  function recordOccurrence(value: DiagnosticOccurrence): void {
    const item = adoptDiagnosticOccurrence(value);
    if (diagnosticIds.has(item.id) || diagnosticStepIds.has(item.id)) return;
    retainDiagnostic(item);
    appendStep(Object.freeze({ kind: 'diagnostic', occurrence: item }));
  }

  function appendStep(step: InteractionTranscriptStep): void {
    try {
      suppliedOptions.onStep?.(step);
    } catch (cause) {
      const occurrence = reporter.report(diagnostic(
        'TRANSCRIPT_SINK_FAILED',
        'Transcript step sink failed.',
        { severity: 'warning', target: id, cause }
      ));
      if (!diagnosticIds.has(occurrence.id) && !diagnosticStepIds.has(occurrence.id)) {
        retainDiagnostic(occurrence);
        retainStep(Object.freeze({ kind: 'diagnostic', occurrence }));
      }
    }
    retainStep(step);
  }

  function retainStep(step: InteractionTranscriptStep): void {
    if (retainedStepLimit === 0) {
      omittedSteps += 1;
      return;
    }
    if (steps.length < retainedStepLimit) {
      steps.push(step);
      retainDiagnosticStepId(step);
      return;
    }
    releaseDiagnosticStepId(steps[oldestStepIndex]);
    steps[oldestStepIndex] = step;
    retainDiagnosticStepId(step);
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

  function retainDiagnostic(item: DiagnosticOccurrence): void {
    if (retention.maxDiagnostics === 0) {
      omittedDiagnostics += 1;
      return;
    }
    if (diagnostics.length === retention.maxDiagnostics) {
      const removed = diagnostics.shift();
      if (removed !== undefined) diagnosticIds.delete(removed.id);
      omittedDiagnostics += 1;
    }
    diagnosticIds.add(item.id);
    diagnostics.push(item);
  }

  function retainDiagnosticStepId(step: InteractionTranscriptStep): void {
    if (step.kind === 'diagnostic') diagnosticStepIds.add(step.occurrence.id);
  }

  function releaseDiagnosticStepId(step: InteractionTranscriptStep | undefined): void {
    if (step?.kind === 'diagnostic') diagnosticStepIds.delete(step.occurrence.id);
  }
}

function prepareRetention(value: unknown): Readonly<Required<TranscriptRetentionPolicy>> {
  if (value === undefined) return defaultTranscriptRetentionPolicy;
  if (!isNonArrayObject(value)) throw new TypeError('Transcript retention must be an object.');
  return Object.freeze({
    maxSteps: retentionLimit(value['maxSteps'], defaultTranscriptRetentionPolicy.maxSteps, 'maxSteps'),
    maxDiagnostics: retentionLimit(
      value['maxDiagnostics'],
      defaultTranscriptRetentionPolicy.maxDiagnostics,
      'maxDiagnostics'
    ),
    maxRedactions: retentionLimit(
      value['maxRedactions'],
      defaultTranscriptRetentionPolicy.maxRedactions,
      'maxRedactions'
    )
  });
}

function retentionLimit(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`Transcript retention ${field} must be a non-negative safe integer.`);
  }
  return value as number;
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
