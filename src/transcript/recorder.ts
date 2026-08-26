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
  decodeDiagnosticOccurrence,
  createDiagnosticOccurrenceReporter,
  diagnostic
} from '../diagnostics.ts';
import { snapshotCanonicalJsonValue, snapshotUnknownJsonValue } from '../foundation/json.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { FrameDescriptor } from '../renderer/index.ts';
import { fullRewriteDiffFromFrame } from '../renderer/internal/diff-interpreter.ts';
import { isCanonicalDateTime } from '../foundation/validation.ts';
import { snapshotInputEvent } from '../input/index.ts';
import { decodeAccessibleSnapshot } from '../accessibility/index.ts';
import { isNonArrayObject, isStringMember } from '../foundation/validation.ts';
import { transcriptSources } from './types.ts';
import {
  transcriptDiagnosticWeight,
  transcriptRedactionWeight,
  transcriptStepWeight
} from './retention.ts';
import type { TranscriptEvidenceWeight } from './retention.ts';

const maximumTranscriptIdCodeUnits = 256;

export const defaultTranscriptRetentionPolicy: Readonly<Required<TranscriptRetentionPolicy>> = Object.freeze({
  maxSteps: 10_000,
  maxDiagnostics: 1_000,
  maxRedactions: 1_000,
  maxRetainedBytes: 32 * 1_024 * 1_024,
  maxRetainedJsonNodes: 1_000_000,
  maxRetainedStringCodeUnits: 1_100_000,
  maxRetainedCells: 100_000,
  maxRetainedGraphics: 10_000
});

type RetainedEvidence =
  | RetainedStep
  | RetainedDiagnostic
  | RetainedRedaction;

interface RetainedStep extends RetainedEvidenceBase {
  readonly category: 'step';
  payload?: RetainedEvidencePayload<InteractionTranscriptStep>;
}

interface RetainedDiagnostic extends RetainedEvidenceBase {
  readonly category: 'diagnostic';
  payload?: RetainedEvidencePayload<DiagnosticOccurrence>;
}

interface RetainedRedaction extends RetainedEvidenceBase {
  readonly category: 'redaction';
  payload?: RetainedEvidencePayload<TranscriptRedaction>;
}

interface RetainedEvidenceBase {
  active: boolean;
}

interface RetainedEvidencePayload<TValue> {
  value: TValue;
  weight: TranscriptEvidenceWeight;
}

type RetentionQueue<TEntry extends RetainedEvidence = RetainedEvidence> = Set<TEntry>;

export function createTranscriptRecorder(options?: TranscriptRecorderOptions): TranscriptRecorder;
export function createTranscriptRecorder(value: unknown = {}): TranscriptRecorder {
  if (!isNonArrayObject(value)) throw new TypeError('Transcript recorder options must be an object.');
  const options = value;
  const sourceValue = options['source'] ?? 'test';
  if (!isStringMember(sourceValue, transcriptSources)) {
    throw new TypeError('Transcript source is invalid.');
  }
  const suppliedIdValue = options['id'];
  if (suppliedIdValue !== undefined && (
    typeof suppliedIdValue !== 'string'
    || suppliedIdValue.trim() === ''
    || suppliedIdValue.length > maximumTranscriptIdCodeUnits
  )) {
    throw new TypeError(
      `Transcript id must contain 1-${String(maximumTranscriptIdCodeUnits)} code units when provided.`
    );
  }
  const startedAtValue = options['startedAt'] ?? new Date(0).toISOString();
  if (typeof startedAtValue !== 'string') throw new TypeError('Transcript startedAt must be a string.');
  const onStep = options['onStep'];
  if (onStep !== undefined && typeof onStep !== 'function') {
    throw new TypeError('Transcript onStep must be a function.');
  }
  const retention = decodeRetention(options['retention']);
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
  const steps = retentionQueue<RetainedStep>();
  const diagnostics = retentionQueue<RetainedDiagnostic>();
  const redactions = retentionQueue<RetainedRedaction>();
  const evidence = retentionQueue();
  let retainedSteps = 0;
  let retainedDiagnostics = 0;
  let retainedRedactions = 0;
  let retainedBytes = 0;
  let retainedJsonNodes = 0;
  let retainedStringCodeUnits = 0;
  let retainedCells = 0;
  let retainedGraphics = 0;
  let omittedSteps = 0;
  const diagnosticIds = new Set<string>();
  const diagnosticStepIds = new Set<string>();
  let omittedDiagnostics = 0;
  const reporter = createDiagnosticOccurrenceReporter(`${id}:transcript`);
  let omittedRedactions = 0;
  return {
    record(step) {
      if (commitExceedsRetention(step, retention)) {
        omittedSteps += 1;
        return;
      }
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
      retainEvidence({
        category: 'redaction',
        active: true,
        payload: { value: item, weight: transcriptRedactionWeight(item) }
      });
    },
    snapshot(): InteractionTranscript {
      ensureReplayCheckpoint();
      return Object.freeze({
        formatVersion: interactionTranscriptFormatVersion,
        id,
        source,
        startedAt,
        steps: Object.freeze(activeSteps(steps).map((entry) => entry.payload.value)),
        omittedSteps,
        diagnostics: Object.freeze(activeDiagnostics(diagnostics).map((entry) => entry.payload.value)),
        omittedDiagnostics,
        redactions: Object.freeze(activeRedactions(redactions).map((entry) => entry.payload.value)),
        omittedRedactions
      });
    }
  };

  function recordOccurrence(value: DiagnosticOccurrence): void {
    const item = decodeDiagnosticOccurrence(value);
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
    retainEvidence({
      category: 'step',
      active: true,
      payload: { value: step, weight: transcriptStepWeight(step) }
    });
  }

  function retainDiagnostic(item: DiagnosticOccurrence): void {
    retainEvidence({
      category: 'diagnostic',
      active: true,
      payload: { value: item, weight: transcriptDiagnosticWeight(item) }
    });
  }

  function retainEvidence(entry: RetainedEvidence): void {
    switch (entry.category) {
      case 'step': {
        const payload = entry.payload;
        if (payload === undefined) return;
        activateEvidence(entry, payload.weight);
        steps.add(entry);
        retainedSteps += 1;
        if (payload.value.kind === 'diagnostic') diagnosticStepIds.add(payload.value.occurrence.id);
        enforceCount(steps, retention.maxSteps, () => retainedSteps);
        break;
      }
      case 'diagnostic': {
        const payload = entry.payload;
        if (payload === undefined) return;
        activateEvidence(entry, payload.weight);
        diagnostics.add(entry);
        retainedDiagnostics += 1;
        diagnosticIds.add(payload.value.id);
        enforceCount(diagnostics, retention.maxDiagnostics, () => retainedDiagnostics);
        break;
      }
      case 'redaction': {
        const payload = entry.payload;
        if (payload === undefined) return;
        activateEvidence(entry, payload.weight);
        redactions.add(entry);
        retainedRedactions += 1;
        enforceCount(redactions, retention.maxRedactions, () => retainedRedactions);
        break;
      }
    }
    enforceResourceLimits();
  }

  function activateEvidence(entry: RetainedEvidence, weight: TranscriptEvidenceWeight): void {
    evidence.add(entry);
    retainedBytes += weight.bytes;
    retainedJsonNodes += weight.jsonNodes;
    retainedStringCodeUnits += weight.stringCodeUnits;
    retainedCells += weight.cells;
    retainedGraphics += weight.graphics;
  }

  function enforceCount(queue: RetentionQueue, limit: number, count: () => number): void {
    while (count() > limit) {
      const entry = shiftActive(queue);
      if (entry === undefined) return;
      evict(entry);
    }
  }

  function enforceResourceLimits(): void {
    while (
      retainedBytes > retention.maxRetainedBytes
      || retainedJsonNodes > retention.maxRetainedJsonNodes
      || retainedStringCodeUnits > retention.maxRetainedStringCodeUnits
      || retainedCells > retention.maxRetainedCells
      || retainedGraphics > retention.maxRetainedGraphics
    ) {
      const entry = shiftActive(evidence);
      if (entry === undefined) return;
      evict(entry);
    }
  }

  function evict(entry: RetainedEvidence): void {
    if (!entry.active) return;
    switch (entry.category) {
      case 'step': {
        const payload = entry.payload;
        if (payload === undefined) return;
        deactivateEvidence(entry, payload.weight);
        retainedSteps -= 1;
        omittedSteps += 1;
        if (payload.value.kind === 'diagnostic') diagnosticStepIds.delete(payload.value.occurrence.id);
        break;
      }
      case 'diagnostic': {
        const payload = entry.payload;
        if (payload === undefined) return;
        deactivateEvidence(entry, payload.weight);
        retainedDiagnostics -= 1;
        omittedDiagnostics += 1;
        diagnosticIds.delete(payload.value.id);
        break;
      }
      case 'redaction': {
        const payload = entry.payload;
        if (payload === undefined) return;
        deactivateEvidence(entry, payload.weight);
        retainedRedactions -= 1;
        omittedRedactions += 1;
        break;
      }
    }
    evidence.delete(entry);
    categoryQueue(entry).delete(entry);
    delete entry.payload;
  }

  function categoryQueue(entry: RetainedEvidence): RetentionQueue {
    switch (entry.category) {
      case 'step': return steps;
      case 'diagnostic': return diagnostics;
      case 'redaction': return redactions;
    }
  }

  function deactivateEvidence(entry: RetainedEvidence, weight: TranscriptEvidenceWeight): void {
    entry.active = false;
    retainedBytes -= weight.bytes;
    retainedJsonNodes -= weight.jsonNodes;
    retainedStringCodeUnits -= weight.stringCodeUnits;
    retainedCells -= weight.cells;
    retainedGraphics -= weight.graphics;
  }

  function ensureReplayCheckpoint(): void {
    let firstCommit = activeSteps(steps).find((entry) => entry.payload.value.kind === 'commit');
    while (
      firstCommit?.payload.value.kind === 'commit'
      && !firstCommit.payload.value.commit.diff.fullRewrite
    ) {
      const commit = firstCommit.payload.value.commit;
      const checkpoint = Object.freeze({
        kind: 'commit' as const,
        commit: Object.freeze({ ...commit, diff: fullRewriteDiffFromFrame(commit.frame) })
      });
      const previousWeight = firstCommit.payload.weight;
      firstCommit.payload.value = checkpoint;
      firstCommit.payload.weight = transcriptStepWeight(checkpoint);
      replaceEvidenceWeight(previousWeight, firstCommit.payload.weight);
      enforceResourceLimits();
      if (firstCommit.active) return;
      firstCommit = activeSteps(steps).find((entry) => entry.payload.value.kind === 'commit');
    }
  }

  function replaceEvidenceWeight(
    previous: TranscriptEvidenceWeight,
    next: TranscriptEvidenceWeight
  ): void {
    retainedBytes += next.bytes - previous.bytes;
    retainedJsonNodes += next.jsonNodes - previous.jsonNodes;
    retainedStringCodeUnits += next.stringCodeUnits - previous.stringCodeUnits;
    retainedCells += next.cells - previous.cells;
    retainedGraphics += next.graphics - previous.graphics;
  }
}

function decodeRetention(value: unknown): Readonly<Required<TranscriptRetentionPolicy>> {
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
    ),
    maxRetainedBytes: retentionLimit(
      value['maxRetainedBytes'],
      defaultTranscriptRetentionPolicy.maxRetainedBytes,
      'maxRetainedBytes'
    ),
    maxRetainedJsonNodes: retentionLimit(
      value['maxRetainedJsonNodes'],
      defaultTranscriptRetentionPolicy.maxRetainedJsonNodes,
      'maxRetainedJsonNodes'
    ),
    maxRetainedStringCodeUnits: retentionLimit(
      value['maxRetainedStringCodeUnits'],
      defaultTranscriptRetentionPolicy.maxRetainedStringCodeUnits,
      'maxRetainedStringCodeUnits'
    ),
    maxRetainedCells: retentionLimit(
      value['maxRetainedCells'],
      defaultTranscriptRetentionPolicy.maxRetainedCells,
      'maxRetainedCells'
    ),
    maxRetainedGraphics: retentionLimit(
      value['maxRetainedGraphics'],
      defaultTranscriptRetentionPolicy.maxRetainedGraphics,
      'maxRetainedGraphics'
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

function retentionQueue<TEntry extends RetainedEvidence>(): RetentionQueue<TEntry> {
  return new Set<TEntry>();
}

function shiftActive<TEntry extends RetainedEvidence>(queue: RetentionQueue<TEntry>): TEntry | undefined {
  const entry = queue.values().next().value;
  if (entry !== undefined) queue.delete(entry);
  return entry?.active === true && entry.payload !== undefined ? entry : undefined;
}

function activeSteps(
  queue: RetentionQueue<RetainedStep>
): (RetainedStep & { payload: RetainedEvidencePayload<InteractionTranscriptStep> })[] {
  return Array.from(queue).filter(
    (entry): entry is RetainedStep & { payload: RetainedEvidencePayload<InteractionTranscriptStep> } =>
      entry.active && entry.payload !== undefined
  );
}

function activeDiagnostics(
  queue: RetentionQueue<RetainedDiagnostic>
): (RetainedDiagnostic & { payload: RetainedEvidencePayload<DiagnosticOccurrence> })[] {
  return Array.from(queue).filter(
    (entry): entry is RetainedDiagnostic & { payload: RetainedEvidencePayload<DiagnosticOccurrence> } =>
      entry.active && entry.payload !== undefined
  );
}

function activeRedactions(
  queue: RetentionQueue<RetainedRedaction>
): (RetainedRedaction & { payload: RetainedEvidencePayload<TranscriptRedaction> })[] {
  return Array.from(queue).filter(
    (entry): entry is RetainedRedaction & { payload: RetainedEvidencePayload<TranscriptRedaction> } =>
      entry.active && entry.payload !== undefined
  );
}

function commitExceedsRetention(
  step: InteractionTranscriptStep,
  retention: Readonly<Required<TranscriptRetentionPolicy>>
): boolean {
  if (step.kind !== 'commit') return false;
  const frame = step.commit.frame;
  const diff = step.commit.diff;
  return Array.isArray(frame.cells)
    && Array.isArray(frame.graphics)
    && Array.isArray(diff.graphicOperations)
    && (
      frame.cells.length > retention.maxRetainedCells
      || frame.graphics.length + diff.graphicOperations.length > retention.maxRetainedGraphics
    );
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
      if (snapshot.status === 'failure') throw new TypeError(snapshot.error.message);
      return Object.freeze({ kind: 'snapshot', snapshot: snapshot.value });
    }
    case 'diagnostic':
      return Object.freeze({ kind: 'diagnostic', occurrence: decodeDiagnosticOccurrence(step.occurrence) });
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
