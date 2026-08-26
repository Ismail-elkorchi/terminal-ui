import {
  findUnsupportedField,
  isCanonicalDateTime,
  isNonArrayObject,
  isNonEmptyString,
  isStringMember,
} from '../foundation/validation.ts';
import { interactionTranscriptFormatVersion, transcriptSources } from './types.ts';
import type { InteractionTranscript } from './types.ts';

const maximumTranscriptIdCodeUnits = 256;
const transcriptFields = new Set([
  'formatVersion',
  'id',
  'source',
  'startedAt',
  'steps',
  'omittedSteps',
  'diagnostics',
  'omittedDiagnostics',
  'redactions',
  'omittedRedactions',
]);

export interface TranscriptEnvelope {
  readonly id: string;
  readonly source: InteractionTranscript['source'];
  readonly startedAt?: string;
  readonly steps: readonly unknown[];
  readonly omittedSteps: number;
  readonly diagnostics: readonly unknown[];
  readonly omittedDiagnostics: number;
  readonly redactions: readonly unknown[];
  readonly omittedRedactions: number;
}

export interface TranscriptEnvelopeLimits {
  readonly maxSteps: number;
  readonly maxRedactions: number;
}

export function decodeTranscriptEnvelope(
  value: unknown,
  limits: TranscriptEnvelopeLimits,
): TranscriptEnvelope | string {
  if (!isNonArrayObject(value)) return 'Interaction transcript must be an object.';
  const identity = decodeTranscriptEnvelopeIdentity(value);
  if (typeof identity === 'string') return identity;
  const collectionIssue = transcriptEnvelopeCollectionIssue(value, limits);
  if (collectionIssue !== undefined) return collectionIssue;
  if (!Array.isArray(value['steps']) || !Array.isArray(value['diagnostics']) || !Array.isArray(value['redactions'])) {
    return 'Interaction transcript collections were not adopted.';
  }
  return {
    ...identity,
    steps: value['steps'],
    omittedSteps: Number(value['omittedSteps']),
    diagnostics: value['diagnostics'],
    omittedDiagnostics: Number(value['omittedDiagnostics']),
    redactions: value['redactions'],
    omittedRedactions: Number(value['omittedRedactions']),
  };
}

type TranscriptEnvelopeIdentity = Pick<TranscriptEnvelope, 'id' | 'source' | 'startedAt'>;

function decodeTranscriptEnvelopeIdentity(
  value: Readonly<Record<string, unknown>>,
): TranscriptEnvelopeIdentity | string {
  const unknownField = findUnsupportedField(value, transcriptFields);
  if (unknownField !== undefined) return `Interaction transcript contains unsupported field: ${unknownField}.`;
  if (value['formatVersion'] !== interactionTranscriptFormatVersion) return 'Unsupported interaction transcript format version.';
  if (!isNonEmptyString(value['id'])) return 'Interaction transcript id must not be empty.';
  if (value['id'].length > maximumTranscriptIdCodeUnits) {
    return `Interaction transcript id exceeds ${String(maximumTranscriptIdCodeUnits)} code units.`;
  }
  if (!isStringMember(value['source'], transcriptSources)) {
    return `Unsupported interaction transcript source: ${String(value['source'])}.`;
  }
  if (value['startedAt'] !== undefined && !isCanonicalDateTime(value['startedAt'])) {
    return 'Interaction transcript startedAt must be a canonical ISO 8601 date-time when present.';
  }
  return {
    id: value['id'],
    source: value['source'],
    ...(typeof value['startedAt'] === 'string' ? { startedAt: value['startedAt'] } : {}),
  };
}

function transcriptEnvelopeCollectionIssue(
  value: Readonly<Record<string, unknown>>,
  limits: TranscriptEnvelopeLimits,
): string | undefined {
  const steps = value['steps'];
  const diagnostics = value['diagnostics'];
  const redactions = value['redactions'];
  if (!Array.isArray(steps)) return 'Interaction transcript steps must be an array.';
  if (!Array.isArray(diagnostics)) return 'Interaction transcript diagnostics must be an array.';
  if (!Array.isArray(redactions)) return 'Interaction transcript redactions must be an array.';
  for (const field of ['omittedSteps', 'omittedDiagnostics', 'omittedRedactions'] as const) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) {
      return `Interaction transcript ${field} must be a non-negative safe integer.`;
    }
  }
  if (steps.length > limits.maxSteps) {
    return `Interaction transcript exceeds the ${String(limits.maxSteps)}-step limit.`;
  }
  return redactions.length > limits.maxRedactions
    ? `Interaction transcript exceeds the ${String(limits.maxRedactions)}-redaction limit.`
    : undefined;
}
