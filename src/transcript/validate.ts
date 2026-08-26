import { diagnostic } from '../diagnostics.ts';
import { snapshotCanonicalJsonValue } from '../foundation/json.ts';
import {
  findUnsupportedField,
  isNonArrayObject
} from '../foundation/validation.ts';
import { failure, success } from '../result.ts';
import type { Result } from '../result.ts';
import { interactionTranscriptFormatVersion } from './types.ts';
import { decodeTranscriptEnvelope } from './validation-envelope.ts';
import { transcriptConsistencyIssue } from './validation-consistency.ts';
import {
  createTranscriptAdoptions,
  type TranscriptAdoptions,
} from './validation-adoptions.ts';
import {
  decodeTranscriptOccurrence,
  decodeTranscriptStep,
  transcriptDiagnosticOccurrenceIssue,
} from './validation-steps.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptRedaction,
  TranscriptValidationLimits
} from './types.ts';

const redactionFields = new Set(['path', 'reason']);

type NormalizedTranscriptValidationLimits = Readonly<Required<TranscriptValidationLimits>>;

export const defaultTranscriptValidationLimits: Readonly<Required<TranscriptValidationLimits>> = Object.freeze({
  maxDepth: 128,
  maxJsonNodes: 2_000_000,
  maxStringCodeUnits: 2_000_000,
  maxSteps: 100_000,
  maxFrameCells: 100_000,
  maxFrameGraphics: 10_000,
  maxDiffOperations: 1_000_000,
  maxGraphicOperations: 100_000,
  maxDiagnostics: 100_000,
  maxRedactions: 100_000
});

export function validateTranscript(
  transcript: unknown,
  limits: TranscriptValidationLimits = {}
): Result<InteractionTranscript> {
  let decoded: unknown;
  let normalizedLimits: NormalizedTranscriptValidationLimits;
  try {
    normalizedLimits = normalizeTranscriptValidationLimits(limits);
    decoded = snapshotCanonicalJsonValue(transcript, 'Interaction transcript', {
      maxDepth: normalizedLimits.maxDepth,
      maxNodes: normalizedLimits.maxJsonNodes,
      maxStringCodeUnits: normalizedLimits.maxStringCodeUnits
    });
  } catch (cause) {
    return transcriptFailure(errorMessage(cause));
  }
  const adoptions = createTranscriptAdoptions();
  try {
    const result = decodeTranscript(decoded, adoptions, normalizedLimits);
    return typeof result === 'string' ? transcriptFailure(result) : success(result);
  } catch (cause) {
    return transcriptFailure(errorMessage(cause));
  }
}

function normalizeTranscriptValidationLimits(
  limits: TranscriptValidationLimits
): NormalizedTranscriptValidationLimits {
  if (!isNonArrayObject(limits)) {
    throw new TypeError('Transcript validation limits must be an object.');
  }
  const unsupported = findUnsupportedField(limits, transcriptValidationLimitFields);
  if (unsupported !== undefined) {
    throw new TypeError(`Transcript validation limits contain unsupported field: ${unsupported}.`);
  }
  return Object.freeze({
    maxDepth: transcriptLimit(limits['maxDepth'], defaultTranscriptValidationLimits.maxDepth, 'maxDepth'),
    maxJsonNodes: transcriptLimit(
      limits['maxJsonNodes'],
      defaultTranscriptValidationLimits.maxJsonNodes,
      'maxJsonNodes'
    ),
    maxStringCodeUnits: transcriptLimit(
      limits['maxStringCodeUnits'],
      defaultTranscriptValidationLimits.maxStringCodeUnits,
      'maxStringCodeUnits'
    ),
    maxSteps: transcriptLimit(limits['maxSteps'], defaultTranscriptValidationLimits.maxSteps, 'maxSteps'),
    maxFrameCells: transcriptLimit(
      limits['maxFrameCells'],
      defaultTranscriptValidationLimits.maxFrameCells,
      'maxFrameCells'
    ),
    maxFrameGraphics: transcriptLimit(
      limits['maxFrameGraphics'],
      defaultTranscriptValidationLimits.maxFrameGraphics,
      'maxFrameGraphics'
    ),
    maxDiffOperations: transcriptLimit(
      limits['maxDiffOperations'],
      defaultTranscriptValidationLimits.maxDiffOperations,
      'maxDiffOperations'
    ),
    maxGraphicOperations: transcriptLimit(
      limits['maxGraphicOperations'],
      defaultTranscriptValidationLimits.maxGraphicOperations,
      'maxGraphicOperations'
    ),
    maxDiagnostics: transcriptLimit(
      limits['maxDiagnostics'],
      defaultTranscriptValidationLimits.maxDiagnostics,
      'maxDiagnostics'
    ),
    maxRedactions: transcriptLimit(
      limits['maxRedactions'],
      defaultTranscriptValidationLimits.maxRedactions,
      'maxRedactions'
    )
  });
}

const transcriptValidationLimitFields = new Set([
  'maxDepth',
  'maxJsonNodes',
  'maxStringCodeUnits',
  'maxSteps',
  'maxFrameCells',
  'maxFrameGraphics',
  'maxDiffOperations',
  'maxGraphicOperations',
  'maxDiagnostics',
  'maxRedactions'
]);

function transcriptLimit(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`Transcript validation ${field} must be a positive safe integer.`);
  }
  return value;
}

function decodeTranscript(
  transcript: unknown,
  adoptions: TranscriptAdoptions,
  limits: NormalizedTranscriptValidationLimits
): InteractionTranscript | string {
  const envelope = decodeTranscriptEnvelope(transcript, limits);
  if (typeof envelope === 'string') return envelope;
  const diagnosticLimitIssue = transcriptDiagnosticLimitIssue(
    envelope.steps,
    envelope.diagnostics,
    limits.maxDiagnostics
  );
  if (diagnosticLimitIssue !== undefined) return diagnosticLimitIssue;
  const resourceIssue = transcriptResourceIssue(envelope.steps, limits);
  if (resourceIssue !== undefined) return resourceIssue;
  const steps = decodeTranscriptSteps(envelope.steps, adoptions);
  if (typeof steps === 'string') return steps;
  const orderingIssue = transcriptConsistencyIssue(steps);
  if (orderingIssue !== undefined) return orderingIssue;
  const diagnostics = decodeTranscriptDiagnostics(envelope.diagnostics);
  if (typeof diagnostics === 'string') return diagnostics;
  const occurrenceIssue = transcriptDiagnosticOccurrenceIssue(steps, diagnostics);
  if (occurrenceIssue !== undefined) return occurrenceIssue;
  const redactions = decodeTranscriptRedactions(envelope.redactions);
  if (typeof redactions === 'string') return redactions;
  return Object.freeze({
    formatVersion: interactionTranscriptFormatVersion,
    id: envelope.id,
    source: envelope.source,
    ...(envelope.startedAt === undefined ? {} : { startedAt: envelope.startedAt }),
    steps: Object.freeze(steps),
    omittedSteps: envelope.omittedSteps,
    diagnostics: Object.freeze(diagnostics),
    omittedDiagnostics: envelope.omittedDiagnostics,
    redactions: Object.freeze(redactions),
    omittedRedactions: envelope.omittedRedactions,
  });
}

function transcriptResourceIssue(
  steps: readonly unknown[],
  limits: NormalizedTranscriptValidationLimits,
): string | undefined {
  let frameCells = 0;
  let frameGraphics = 0;
  let diffOperations = 0;
  let graphicOperations = 0;
  for (const item of steps) {
    if (!isNonArrayObject(item) || item['kind'] !== 'commit' || !isNonArrayObject(item['commit'])) continue;
    const frame = item['commit']['frame'];
    const diff = item['commit']['diff'];
    frameCells += transcriptArrayLength(frame, 'cells');
    if (frameCells > limits.maxFrameCells) {
      return `Interaction transcript exceeds the ${String(limits.maxFrameCells)}-frame-cell limit.`;
    }
    frameGraphics += transcriptArrayLength(frame, 'graphics');
    if (frameGraphics > limits.maxFrameGraphics) {
      return `Interaction transcript exceeds the ${String(limits.maxFrameGraphics)}-frame-graphic limit.`;
    }
    diffOperations += transcriptArrayLength(diff, 'operations');
    if (diffOperations > limits.maxDiffOperations) {
      return `Interaction transcript exceeds the ${String(limits.maxDiffOperations)}-diff-operation limit.`;
    }
    graphicOperations += transcriptArrayLength(diff, 'graphicOperations');
    if (graphicOperations > limits.maxGraphicOperations) {
      return `Interaction transcript exceeds the ${String(limits.maxGraphicOperations)}-graphic-operation limit.`;
    }
  }
  return undefined;
}

function transcriptArrayLength(value: unknown, field: string): number {
  if (!isNonArrayObject(value)) return 0;
  const array = value[field];
  return Array.isArray(array) ? array.length : 0;
}

function decodeTranscriptSteps(
  values: readonly unknown[],
  adoptions: TranscriptAdoptions,
): readonly InteractionTranscriptStep[] | string {
  const steps: InteractionTranscriptStep[] = [];
  for (const [index, item] of values.entries()) {
    const step = decodeTranscriptStep(item, adoptions);
    if (typeof step === 'string') return `Invalid transcript step at index ${String(index)}: ${step}`;
    steps.push(step);
  }
  return steps;
}

function decodeTranscriptDiagnostics(values: readonly unknown[]): readonly DiagnosticOccurrence[] | string {
  const diagnostics: DiagnosticOccurrence[] = [];
  for (const [index, item] of values.entries()) {
    const occurrence = decodeTranscriptOccurrence(item);
    if (typeof occurrence === 'string') {
      return `Invalid transcript diagnostic at index ${String(index)}: ${occurrence}`;
    }
    diagnostics.push(occurrence);
  }
  return diagnostics;
}

function decodeTranscriptRedactions(values: readonly unknown[]): readonly TranscriptRedaction[] | string {
  const redactions: TranscriptRedaction[] = [];
  for (const [index, item] of values.entries()) {
    if (!isNonArrayObject(item) || typeof item['path'] !== 'string' || item['reason'] !== 'secret') {
      return `Invalid transcript redaction at index ${String(index)}.`;
    }
    const unknownField = findUnsupportedField(item, redactionFields);
    if (unknownField !== undefined) {
      return `Invalid transcript redaction at index ${String(index)}: unsupported field ${unknownField}.`;
    }
    redactions.push(Object.freeze({ path: item['path'], reason: 'secret' }));
  }
  return redactions;
}


function transcriptDiagnosticLimitIssue(
  steps: readonly unknown[],
  diagnostics: readonly unknown[],
  maximum: number
): string | undefined {
  const ids = new Set<string>();
  let unidentified = 0;
  const count = (value: unknown): boolean => {
    const id = isNonArrayObject(value) ? value['id'] : undefined;
    if (typeof id === 'string') ids.add(id);
    else unidentified += 1;
    return ids.size + unidentified > maximum;
  };
  for (const occurrence of diagnostics) {
    if (count(occurrence)) return `Interaction transcript exceeds the ${String(maximum)}-diagnostic limit.`;
  }
  for (const step of steps) {
    if (!isNonArrayObject(step) || step['kind'] !== 'diagnostic') continue;
    if (count(step['occurrence'])) {
      return `Interaction transcript exceeds the ${String(maximum)}-diagnostic limit.`;
    }
  }
  return undefined;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}


function transcriptFailure(message: string): Result<never> {
  return failure(diagnostic('TRANSCRIPT_REPLAY_FAILED', message));
}
