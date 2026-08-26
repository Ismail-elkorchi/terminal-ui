import { decodeAccessibleSnapshot } from '../accessibility/index.ts';
import {
  decodeDiagnosticOccurrence,
  decodeTerminalDiagnostic,
  diagnostic
} from '../diagnostics.ts';
import { snapshotCanonicalJsonValue } from '../foundation/json.ts';
import type { JsonValue } from '../foundation/json.ts';
import {
  findUnsupportedField,
  isCanonicalDateTime,
  isNonArrayObject,
  isNonEmptyString,
  isStringMember
} from '../foundation/validation.ts';
import { tuiMessageSources } from '../interaction/message.ts';
import { failure, success } from '../result.ts';
import { defineTextWidthProfile, measureTextCells } from '../text/index.ts';
import { isFrameCellInteractionState, isFrameCellRole } from '../visual/frame-source.ts';
import {
  applyRenderDiff,
  replayedFrameMatches
} from '../renderer/internal/diff-interpreter.ts';
import type {
  TerminalRestoreCompletion,
  TerminalRestoreResult,
  TerminalStateChange,
  TerminalStateSnapshot,
  TerminalSize
} from '../host/index.ts';
import { LEGACY_KEYBOARD_PROFILE, kittyKeyboardProfile } from '../protocol/index.ts';
import {
  decodeInputEvent
} from '../input/index.ts';
import { pointerEventKinds } from '../input/pointer.ts';
import type { Result } from '../result.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type {
  CursorPosition,
  FrameCell,
  FrameHitTarget,
  Rect,
  RenderOperation
} from '../renderer/index.ts';
import type { ReplayedFrame } from '../renderer/internal/diff-interpreter.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { decodeTerminalStyle } from '../visual/terminal-style.ts';
import type { FrameCellSource, RenderSpan, TerminalLink, TerminalStyle } from '../visual/index.ts';
import type {
  GraphicOperationDescriptor,
  GraphicPlacementDescriptor,
  RasterImageDescriptor,
} from '../graphics/index.ts';
import { interactionTranscriptFormatVersion, transcriptSources } from './types.ts';
import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  TranscriptFrame,
  TranscriptRedaction,
  TranscriptRenderDiff,
  TranscriptRuntimeCommit,
  TranscriptValidationLimits
} from './types.ts';

const frameCellSourceFields = new Set([
  'elementId',
  'elementKind',
  'rendererFamily',
  'cellRole',
  'partName',
  'partType',
  'itemId',
  'itemIndex',
  'interactionState',
  'description'
]);
const maximumTranscriptIdCodeUnits = 256;
const transcriptFrameFields = new Set([
  'width',
  'height',
  'widthProfile',
  'canvasStyle',
  'cells',
  'graphics',
  'hitTargets',
  'cursor',
  'focusPath',
  'accessibility'
]);
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
  'omittedRedactions'
]);
const transcriptStepFields: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  input: new Set(['kind', 'event']),
  message: new Set(['kind', 'source', 'fidelity', 'message']),
  commit: new Set(['kind', 'commit']),
  snapshot: new Set(['kind', 'snapshot']),
  diagnostic: new Set(['kind', 'occurrence']),
  restore: new Set(['kind', 'phase', 'result'])
});
const commitFields = new Set([
  'id',
  'stateVersion',
  'terminalSize',
  'focusPath',
  'frame',
  'diff'
]);
const terminalSizeFields = new Set(['columns', 'rows']);
const redactionFields = new Set(['path', 'reason']);
const frameCellFields = new Set([
  'row',
  'column',
  'text',
  'width',
  'style',
  'link',
  'source',
  'continuation'
]);
const cursorFields = new Set(['row', 'column', 'style', 'source']);
const renderDiffFields = new Set([
  'width',
  'height',
  'widthProfile',
  'canvasStyle',
  'operations',
  'graphicOperations',
  'cursor',
  'fullRewrite',
  'dirtyRegions'
]);
const textWidthProfileFields = new Set(['emoji', 'ambiguous']);
const writeOperationFields = new Set(['kind', 'row', 'column', 'spans']);
const clearRectOperationFields = new Set(['kind', 'bounds', 'style']);
const graphicPlacementFields = new Set(['id', 'image', 'bounds', 'clip', 'fit']);
const rasterImageFields = new Set(['width', 'height', 'format', 'byteLength', 'contentDigest']);
const placeGraphicOperationFields = new Set(['kind', 'placement']);
const removeGraphicOperationFields = new Set(['kind', 'id']);
const renderSpanFields = new Set(['text', 'style', 'link', 'source']);
const terminalLinkFields = new Set(['href', 'id']);
const frameHitTargetFields = new Set([
  'id',
  'bounds',
  'accepts',
  'focus',
  'cursor',
  'zIndex'
]);
const resolvedFocusFields = new Set(['kind', 'path']);
const preservedFocusFields = new Set(['kind']);
const rectFields = new Set(['row', 'column', 'width', 'height']);
const restoreResultFields = new Set([
  'status',
  'reason',
  'requested',
  'attempted',
  'completed',
  'resultingState',
  'diagnostics'
]);
const terminalStateFields = new Set([
  'rawInput',
  'alternateScreen',
  'bracketedPaste',
  'mouseReporting',
  'focusReporting',
  'unicodeGraphemeMode',
  'keyboardProfile',
  'cursorVisible',
  'provenance'
]);
const terminalStateProvenanceFields = new Set([
  'rawInput',
  'alternateScreen',
  'bracketedPaste',
  'mouseReporting',
  'focusReporting',
  'unicodeGraphemeMode',
  'keyboardProfile',
  'cursorVisible'
]);
const terminalStateChangeFields = new Set(['kind', 'state']);
const terminalRestoreCompletionFields = new Set(['kind', 'state', 'assurance']);
const mouseReportingStateFields = new Set(['tracking', 'encoding']);
const legacyKeyboardProfileFields = new Set(['kind']);
const kittyKeyboardProfileFields = new Set(['kind', 'flags']);

type NormalizedTranscriptValidationLimits = Readonly<Required<TranscriptValidationLimits>>;

interface TranscriptAdoptions {
  readonly cursors: WeakMap<object, CursorPosition>;
  readonly diagnostics: WeakMap<object, import('../diagnostics.ts').TerminalDiagnostic>;
  readonly diffs: WeakMap<object, TranscriptRenderDiff>;
  readonly frames: WeakMap<object, TranscriptFrame>;
  readonly keyboardProfiles: WeakMap<object, import('../protocol/index.ts').TerminalKeyboardProfile>;
  readonly operations: WeakMap<object, RenderOperation>;
  readonly restores: WeakMap<object, TerminalRestoreResult>;
  readonly stateChanges: WeakMap<object, TerminalStateChange | TerminalRestoreCompletion>;
  readonly stateSnapshots: WeakMap<object, TerminalStateSnapshot>;
  readonly styles: WeakMap<object, TerminalStyle>;
  readonly widthProfiles: WeakMap<object, TextWidthProfile>;
}

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
  const adoptions: TranscriptAdoptions = {
    cursors: new WeakMap(),
    diagnostics: new WeakMap(),
    diffs: new WeakMap(),
    frames: new WeakMap(),
    keyboardProfiles: new WeakMap(),
    operations: new WeakMap(),
    restores: new WeakMap(),
    stateChanges: new WeakMap(),
    stateSnapshots: new WeakMap(),
    styles: new WeakMap(),
    widthProfiles: new WeakMap()
  };
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
  if (!isNonArrayObject(transcript)) return 'Interaction transcript must be an object.';
  const unknownField = findUnsupportedField(transcript, transcriptFields);
  if (unknownField !== undefined) {
    return `Interaction transcript contains unsupported field: ${unknownField}.`;
  }
  if (transcript['formatVersion'] !== interactionTranscriptFormatVersion) {
    return 'Unsupported interaction transcript format version.';
  }
  if (!isNonEmptyString(transcript['id'])) {
    return 'Interaction transcript id must not be empty.';
  }
  if (transcript['id'].length > maximumTranscriptIdCodeUnits) {
    return `Interaction transcript id exceeds ${String(maximumTranscriptIdCodeUnits)} code units.`;
  }
  if (!isStringMember(transcript['source'], transcriptSources)) {
    return `Unsupported interaction transcript source: ${String(transcript['source'])}.`;
  }
  if (transcript['startedAt'] !== undefined && !isCanonicalDateTime(transcript['startedAt'])) {
    return 'Interaction transcript startedAt must be a canonical ISO 8601 date-time when present.';
  }
  if (!Array.isArray(transcript['steps'])) return 'Interaction transcript steps must be an array.';
  if (!Number.isSafeInteger(transcript['omittedSteps']) || Number(transcript['omittedSteps']) < 0) {
    return 'Interaction transcript omittedSteps must be a non-negative safe integer.';
  }
  if (!Array.isArray(transcript['diagnostics'])) {
    return 'Interaction transcript diagnostics must be an array.';
  }
  if (!Number.isSafeInteger(transcript['omittedDiagnostics']) || Number(transcript['omittedDiagnostics']) < 0) {
    return 'Interaction transcript omittedDiagnostics must be a non-negative safe integer.';
  }
  if (!Array.isArray(transcript['redactions'])) {
    return 'Interaction transcript redactions must be an array.';
  }
  if (!Number.isSafeInteger(transcript['omittedRedactions']) || Number(transcript['omittedRedactions']) < 0) {
    return 'Interaction transcript omittedRedactions must be a non-negative safe integer.';
  }
  if (transcript['steps'].length > limits.maxSteps) {
    return `Interaction transcript exceeds the ${String(limits.maxSteps)}-step limit.`;
  }
  if (transcript['redactions'].length > limits.maxRedactions) {
    return `Interaction transcript exceeds the ${String(limits.maxRedactions)}-redaction limit.`;
  }
  const diagnosticLimitIssue = transcriptDiagnosticLimitIssue(
    transcript['steps'],
    transcript['diagnostics'],
    limits.maxDiagnostics
  );
  if (diagnosticLimitIssue !== undefined) return diagnosticLimitIssue;

  let frameCells = 0;
  let frameGraphics = 0;
  let diffOperations = 0;
  let graphicOperations = 0;
  const steps: InteractionTranscriptStep[] = [];
  for (const [index, item] of transcript['steps'].entries()) {
    if (isNonArrayObject(item) && item['kind'] === 'commit' && isNonArrayObject(item['commit'])) {
      const frame = item['commit']['frame'];
      const diff = item['commit']['diff'];
      if (isNonArrayObject(frame) && Array.isArray(frame['cells'])) {
        frameCells += frame['cells'].length;
        if (frameCells > limits.maxFrameCells) {
          return `Interaction transcript exceeds the ${String(limits.maxFrameCells)}-frame-cell limit.`;
        }
      }
      if (isNonArrayObject(frame) && Array.isArray(frame['graphics'])) {
        frameGraphics += frame['graphics'].length;
        if (frameGraphics > limits.maxFrameGraphics) {
          return `Interaction transcript exceeds the ${String(limits.maxFrameGraphics)}-frame-graphic limit.`;
        }
      }
      if (isNonArrayObject(diff) && Array.isArray(diff['operations'])) {
        diffOperations += diff['operations'].length;
        if (diffOperations > limits.maxDiffOperations) {
          return `Interaction transcript exceeds the ${String(limits.maxDiffOperations)}-diff-operation limit.`;
        }
      }
      if (isNonArrayObject(diff) && Array.isArray(diff['graphicOperations'])) {
        graphicOperations += diff['graphicOperations'].length;
        if (graphicOperations > limits.maxGraphicOperations) {
          return `Interaction transcript exceeds the ${String(limits.maxGraphicOperations)}-graphic-operation limit.`;
        }
      }
    }
    const step = decodeStep(item, adoptions);
    if (typeof step === 'string') return `Invalid transcript step at index ${String(index)}: ${step}`;
    steps.push(step);
  }
  const orderingIssue = transcriptOrderingIssue(steps);
  if (orderingIssue !== undefined) return orderingIssue;
  const diagnostics: DiagnosticOccurrence[] = [];
  for (const [index, item] of transcript['diagnostics'].entries()) {
    const occurrence = decodeOccurrence(item);
    if (typeof occurrence === 'string') {
      return `Invalid transcript diagnostic at index ${String(index)}: ${occurrence}`;
    }
    diagnostics.push(occurrence);
  }
  const occurrenceIssue = transcriptDiagnosticOccurrenceIssue(
    steps,
    diagnostics
  );
  if (occurrenceIssue !== undefined) return occurrenceIssue;
  const redactions: TranscriptRedaction[] = [];
  for (const [index, item] of transcript['redactions'].entries()) {
    if (!isNonArrayObject(item) || typeof item['path'] !== 'string' || item['reason'] !== 'secret') {
      return `Invalid transcript redaction at index ${String(index)}.`;
    }
    const unknownField = findUnsupportedField(item, redactionFields);
    if (unknownField !== undefined) {
      return `Invalid transcript redaction at index ${String(index)}: unsupported field ${unknownField}.`;
    }
    redactions.push(Object.freeze({ path: item['path'], reason: 'secret' }));
  }
  return Object.freeze({
    formatVersion: interactionTranscriptFormatVersion,
    id: transcript['id'],
    source: transcript['source'],
    ...(typeof transcript['startedAt'] === 'string' ? { startedAt: transcript['startedAt'] } : {}),
    steps: Object.freeze(steps),
    omittedSteps: Number(transcript['omittedSteps']),
    diagnostics: Object.freeze(diagnostics),
    omittedDiagnostics: Number(transcript['omittedDiagnostics']),
    redactions: Object.freeze(redactions),
    omittedRedactions: Number(transcript['omittedRedactions'])
  });
}

function transcriptDiagnosticOccurrenceIssue(
  steps: readonly InteractionTranscriptStep[],
  diagnostics: readonly DiagnosticOccurrence[]
): string | undefined {
  const stepOccurrences = new Map<string, string>();
  for (const step of steps) {
    if (step.kind !== 'diagnostic') continue;
    const occurrence = step.occurrence;
    if (stepOccurrences.has(occurrence.id)) {
      return `Transcript diagnostic occurrence id ${occurrence.id} is duplicated in steps.`;
    }
    stepOccurrences.set(occurrence.id, occurrence.diagnostic.fingerprint);
  }

  const topLevelOccurrences = new Set<string>();
  for (const occurrence of diagnostics) {
    if (topLevelOccurrences.has(occurrence.id)) {
      return `Transcript diagnostic occurrence id ${occurrence.id} is duplicated in top-level diagnostics.`;
    }
    topLevelOccurrences.add(occurrence.id);
    const stepFingerprint = stepOccurrences.get(occurrence.id);
    if (stepFingerprint !== undefined && stepFingerprint !== occurrence.diagnostic.fingerprint) {
      return `Transcript diagnostic occurrence id ${occurrence.id} has conflicting content between steps and top-level diagnostics.`;
    }
  }
  return undefined;
}

function decodeOccurrence(value: unknown): DiagnosticOccurrence | string {
  if (!isNonArrayObject(value)) return 'diagnostic occurrence must be an object.';
  try {
    return decodeDiagnosticOccurrence(value);
  } catch (cause) {
    return errorMessage(cause).replace(/^Invalid diagnostic occurrence: /u, '');
  }
}

function decodeDiagnosticIssue(value: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(value)) return 'diagnostic must be an object.';
  try {
    adoptions.diagnostics.set(value, decodeTerminalDiagnostic(value));
    return undefined;
  } catch (cause) {
    return errorMessage(cause).replace(/^Invalid terminal diagnostic: /u, '');
  }
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

function transcriptOrderingIssue(steps: readonly InteractionTranscriptStep[]): string | undefined {
  const commitIds = new Set<string>();
  let lastStateVersion = -1;
  let restorationSeen = false;
  let previousFrame: ReplayedFrame | undefined;
  for (const [index, step] of steps.entries()) {
    if (step.kind === 'restore' && step.phase === 'shutdown') {
      restorationSeen = true;
      continue;
    }
    if (restorationSeen && (step.kind === 'commit' || step.kind === 'input' || step.kind === 'message')) {
      return `Transcript ${step.kind} step at index ${String(index)} occurs after shutdown restoration.`;
    }
    if (step.kind !== 'commit') continue;
    const { id, stateVersion, frame, diff } = step.commit;
    if (commitIds.has(id)) return `Transcript commit id ${id} is duplicated.`;
    commitIds.add(id);
    if (stateVersion < lastStateVersion) {
      return `Transcript commit stateVersion decreases at index ${String(index)}.`;
    }
    lastStateVersion = stateVersion;
    if (previousFrame === undefined && !diff.fullRewrite) {
      return `Transcript first commit at index ${String(index)} must contain a full rewrite.`;
    }
    try {
      const replayed = applyRenderDiff(previousFrame, diff);
      if (!replayedFrameMatches(replayed, frame)) {
        return `Transcript commit at index ${String(index)} diff does not reproduce its frame.`;
      }
      previousFrame = replayed;
    } catch (cause) {
      return `Transcript commit at index ${String(index)} diff chain is invalid: ${errorMessage(cause)}.`;
    }
  }
  return undefined;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function decodeStep(step: unknown, adoptions: TranscriptAdoptions): InteractionTranscriptStep | string {
  if (!isNonArrayObject(step)) return 'step must be an object.';
  const fields = typeof step['kind'] === 'string'
    ? transcriptStepFields[step['kind']]
    : undefined;
  if (fields !== undefined) {
    const unknownField = findUnsupportedField(step, fields);
    if (unknownField !== undefined) {
      return `step contains unsupported field: ${unknownField}.`;
    }
  }
  switch (step['kind']) {
    case 'input': {
      try {
        return Object.freeze({ kind: 'input', event: decodeInputEvent(step['event']) });
      } catch (cause) {
        return errorMessage(cause);
      }
    }
    case 'message': {
      const issue = messageStepIssue(step);
      if (issue !== undefined) return issue;
      const source = step['source'];
      const fidelity = step['fidelity'];
      if (!isStringMember(source, tuiMessageSources)
        || (fidelity !== 'exact' && fidelity !== 'normalized')) {
        return 'message step values are invalid.';
      }
      return Object.freeze({
        kind: 'message',
        source,
        fidelity,
        message: step['message'] as JsonValue
      });
    }
    case 'commit': {
      const commit = decodeCommit(step['commit'], adoptions);
      return typeof commit === 'string' ? commit : Object.freeze({ kind: 'commit', commit });
    }
    case 'snapshot': {
      const snapshot = decodeSnapshot(step['snapshot']);
      return typeof snapshot === 'string' ? snapshot : Object.freeze({ kind: 'snapshot', snapshot });
    }
    case 'diagnostic': {
      const occurrence = decodeOccurrence(step['occurrence']);
      return typeof occurrence === 'string'
        ? occurrence
        : Object.freeze({ kind: 'diagnostic', occurrence });
    }
    case 'restore': {
      if (step['phase'] !== 'checkpoint' && step['phase'] !== 'shutdown') {
        return 'restore step phase must be "checkpoint" or "shutdown".';
      }
      const issue = restoreResultIssue(step['result'], adoptions);
      if (issue !== undefined) return issue;
      if (!isNonArrayObject(step['result'])) return 'restore result was not adopted.';
      const result = adoptions.restores.get(step['result']);
      return result === undefined
        ? 'restore result was not adopted.'
        : Object.freeze({ kind: 'restore', phase: step['phase'], result });
    }
    default:
      return `unsupported step kind: ${String(step['kind'])}.`;
  }
}

function decodeCommit(value: unknown, adoptions: TranscriptAdoptions): TranscriptRuntimeCommit | string {
  if (!isNonArrayObject(value)) return 'commit must be an object.';
  const unknownField = findUnsupportedField(value, commitFields);
  if (unknownField !== undefined) return `commit contains unsupported field: ${unknownField}.`;
  if (!isNonEmptyString(value['id'])) return 'commit id must not be empty.';
  if (!isIntegerAtLeast(value['stateVersion'], 0)) return 'commit stateVersion must be a non-negative integer.';
  const terminalSize = terminalSizeIssue(value['terminalSize']);
  if (terminalSize !== undefined) return `commit terminal size: ${terminalSize}`;
  const focusPath = value['focusPath'];
  if (focusPath !== undefined && !isStringArray(focusPath)) {
    return 'commit focusPath must be a string array.';
  }
  const frameIssueResult = frameIssue(value['frame'], adoptions);
  if (frameIssueResult !== undefined) return `commit frame: ${frameIssueResult}`;
  const diffIssue = renderDiffIssue(value['diff'], adoptions);
  if (diffIssue !== undefined) return `commit diff: ${diffIssue}`;
  if (!isNonArrayObject(value['terminalSize']) || !isNonArrayObject(value['frame']) || !isNonArrayObject(value['diff'])) {
    return 'commit terminal size, frame, and diff must be objects.';
  }
  const columns = value['terminalSize']['columns'];
  const rows = value['terminalSize']['rows'];
  if (value['frame']['width'] !== columns || value['diff']['width'] !== columns) {
    return 'commit frame and diff width must match terminal size columns.';
  }
  if (value['frame']['height'] !== rows || value['diff']['height'] !== rows) {
    return 'commit frame and diff height must match terminal size rows.';
  }
  if (!sameWidthProfile(value['frame']['widthProfile'], value['diff']['widthProfile'])) {
    return 'commit frame and diff width profiles must match.';
  }
  if (!sameOptionalStringArray(value['focusPath'], value['frame']['focusPath'])) {
    return 'commit focusPath must match frame focusPath.';
  }
  const adoptedFrame = adoptions.frames.get(value['frame']);
  const adoptedDiff = adoptions.diffs.get(value['diff']);
  if (adoptedFrame === undefined || adoptedDiff === undefined) {
    return 'commit frame and diff were not adopted.';
  }
  return Object.freeze({
    id: value['id'],
    stateVersion: Number(value['stateVersion']),
    terminalSize: Object.freeze({ columns: Number(columns), rows: Number(rows) }),
    ...(focusPath === undefined ? {} : { focusPath: Object.freeze([...focusPath]) }),
    frame: adoptedFrame,
    diff: adoptedDiff
  });
}

function sameWidthProfile(left: unknown, right: unknown): boolean {
  if (!isNonArrayObject(left) || !isNonArrayObject(right)) return left === right;
  return left['emoji'] === right['emoji'] && left['ambiguous'] === right['ambiguous'];
}

function sameOptionalStringArray(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (!isStringArray(left) || !isStringArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function messageStepIssue(step: Record<string, unknown>): string | undefined {
  if (!isStringMember(step['source'], tuiMessageSources)) return `unsupported message source: ${String(step['source'])}.`;
  if (step['fidelity'] !== 'exact' && step['fidelity'] !== 'normalized') {
    return 'message step fidelity must be "exact" or "normalized".';
  }
  return Object.hasOwn(step, 'message') ? undefined : 'message step requires message.';
}

function frameIssue(frame: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(frame)) return 'frame must be an object.';
  const unknownField = findUnsupportedField(frame, transcriptFrameFields);
  if (unknownField !== undefined) return `frame contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(frame['width'], 0) || !isIntegerAtLeast(frame['height'], 0)) {
    return 'frame width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(frame['widthProfile'], adoptions);
  if (widthProfile !== undefined) return `frame widthProfile: ${widthProfile}`;
  const canvasStyleIssue = terminalStyleIssue(frame['canvasStyle'], 'frame canvas style', adoptions);
  if (canvasStyleIssue !== undefined) return canvasStyleIssue;
  if (!Array.isArray(frame['cells'])) return 'frame cells must be an array.';
  const cells: FrameCell[] = [];
  for (const [index, cell] of frame['cells'].entries()) {
    const issue = frameCellIssue(cell, adoptions);
    if (issue !== undefined) return `frame cell ${String(index)}: ${issue}`;
    if (isNonArrayObject(cell)) cells.push(decodedFrameCell(cell, adoptions));
  }
  if (!Array.isArray(frame['graphics'])) return 'frame graphics must be an array.';
  const graphics: GraphicPlacementDescriptor[] = [];
  for (const [index, placement] of frame['graphics'].entries()) {
    const decoded = decodedGraphicPlacement(placement, Number(frame['width']), Number(frame['height']));
    if (typeof decoded === 'string') return `frame graphic ${String(index)}: ${decoded}`;
    graphics.push(decoded);
  }
  let cursor: CursorPosition | undefined;
  if (frame['cursor'] !== undefined) {
    const issue = cursorIssue(frame['cursor'], adoptions);
    if (issue !== undefined) return issue;
    if (isNonArrayObject(frame['cursor'])) cursor = adoptions.cursors.get(frame['cursor']);
  }
  let hitTargets: readonly FrameHitTarget[] | undefined;
  if (frame['hitTargets'] !== undefined) {
    if (!Array.isArray(frame['hitTargets'])) return 'frame hitTargets must be an array.';
    const ownedTargets: FrameHitTarget[] = [];
    for (const [index, target] of frame['hitTargets'].entries()) {
      const issue = frameHitTargetIssue(target, Number(frame['width']), Number(frame['height']));
      if (issue !== undefined) return `frame hit target ${String(index)}: ${issue}`;
      if (isNonArrayObject(target)) ownedTargets.push(decodedFrameHitTarget(target));
    }
    hitTargets = Object.freeze(ownedTargets);
  }
  const focusPath = frame['focusPath'];
  if (focusPath !== undefined && !isStringArray(focusPath)) {
    return 'frame focusPath must be a string array.';
  }
  const accessibility = decodeSnapshot(frame['accessibility']);
  if (typeof accessibility === 'string') return `frame accessibility: ${accessibility}`;
  if (!isNonArrayObject(frame['widthProfile'])) return 'frame widthProfile was not adopted.';
  const profile = adoptions.widthProfiles.get(frame['widthProfile']);
  if (profile === undefined) return 'frame width profile was not adopted.';
  const canvasStyle = isNonArrayObject(frame['canvasStyle'])
    ? adoptions.styles.get(frame['canvasStyle'])
    : undefined;
  adoptions.frames.set(frame, Object.freeze({
    width: Number(frame['width']),
    height: Number(frame['height']),
    widthProfile: profile,
    ...(canvasStyle === undefined ? {} : { canvasStyle }),
    cells: Object.freeze(cells),
    graphics: Object.freeze(graphics),
    ...(hitTargets === undefined ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(focusPath === undefined ? {} : { focusPath: Object.freeze([...focusPath]) }),
    accessibility
  }));
  return undefined;
}

function frameCellIssue(cell: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(cell)) return 'cell must be an object.';
  const unknownField = findUnsupportedField(cell, frameCellFields);
  if (unknownField !== undefined) return `cell contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(cell['row'], 1) || !isIntegerAtLeast(cell['column'], 1)) {
    return 'row and column must be positive integers.';
  }
  if (typeof cell['text'] !== 'string') return 'text must be a string.';
  if (!isIntegerAtLeast(cell['width'], 0)) return 'width must be a non-negative integer.';
  if (cell['continuation'] !== undefined && typeof cell['continuation'] !== 'boolean') {
    return 'continuation must be a boolean.';
  }
  const style = terminalStyleIssue(cell['style'], 'cell style', adoptions);
  if (style !== undefined) return style;
  const link = terminalLinkIssue(cell['link']);
  if (link !== undefined) return `link: ${link}`;
  const sourceIssue = frameCellSourceIssue(cell['source']);
  if (sourceIssue !== undefined) return `source: ${sourceIssue}`;
  return undefined;
}

function cursorIssue(cursor: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(cursor)) return 'frame cursor must be an object.';
  const unknownField = findUnsupportedField(cursor, cursorFields);
  if (unknownField !== undefined) return `cursor contains unsupported field: ${unknownField}.`;
  const typed = cursor as Partial<CursorPosition>;
  if (!isIntegerAtLeast(typed.row, 1) || !isIntegerAtLeast(typed.column, 1)) {
    return 'frame cursor row and column must be positive integers.';
  }
  const style = terminalStyleIssue(cursor['style'], 'cursor style', adoptions);
  if (style !== undefined) return style;
  const sourceIssue = frameCellSourceIssue(cursor['source']);
  if (sourceIssue !== undefined) return `frame cursor source: ${sourceIssue}`;
  adoptions.cursors.set(cursor, decodedCursor(cursor, adoptions));
  return undefined;
}

function renderDiffIssue(diff: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(diff)) return 'diff must be an object.';
  const unknownField = findUnsupportedField(diff, renderDiffFields);
  if (unknownField !== undefined) return `diff contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(diff['width'], 0) || !isIntegerAtLeast(diff['height'], 0)) {
    return 'diff width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(diff['widthProfile'], adoptions);
  if (widthProfile !== undefined) return `diff widthProfile: ${widthProfile}`;
  const normalizedWidthProfile = isNonArrayObject(diff['widthProfile'])
    ? adoptions.widthProfiles.get(diff['widthProfile'])
    : undefined;
  if (normalizedWidthProfile === undefined) return 'diff widthProfile was not adopted.';
  const width = Number(diff['width']);
  const height = Number(diff['height']);
  const canvasStyleIssue = terminalStyleIssue(diff['canvasStyle'], 'diff canvasStyle', adoptions);
  if (canvasStyleIssue !== undefined) return canvasStyleIssue;
  if (typeof diff['fullRewrite'] !== 'boolean') return 'diff fullRewrite must be a boolean.';
  if (!Array.isArray(diff['operations'])) return 'diff operations must be an array.';
  if (!Array.isArray(diff['graphicOperations'])) return 'diff graphicOperations must be an array.';
  if (diff['cursor'] !== undefined) {
    const issue = cursorIssue(diff['cursor'], adoptions);
    if (issue !== undefined) return `diff cursor: ${issue}`;
    if (isNonArrayObject(diff['cursor']) && !pointFits(diff['cursor'], width, height)) {
      return 'diff cursor must fit within the declared frame.';
    }
  }
  if (diff['dirtyRegions'] !== undefined) {
    if (!Array.isArray(diff['dirtyRegions'])) return 'diff dirtyRegions must be an array.';
    for (const [index, rect] of diff['dirtyRegions'].entries()) {
      const issue = boundedRectIssue(rect, width, height);
      if (issue !== undefined) return `diff dirtyRegions ${String(index)}: ${issue}`;
    }
  }
  for (const [index, operation] of diff['operations'].entries()) {
    const issue = renderOperationIssue(operation, width, height, normalizedWidthProfile, adoptions);
    if (issue !== undefined) return `diff operation ${String(index)}: ${issue}`;
  }
  const graphicOperations: GraphicOperationDescriptor[] = [];
  for (const [index, operation] of diff['graphicOperations'].entries()) {
    const decoded = decodedGraphicOperation(operation, width, height);
    if (typeof decoded === 'string') return `diff graphic operation ${String(index)}: ${decoded}`;
    graphicOperations.push(decoded);
  }
  if (!isNonArrayObject(diff['widthProfile'])) return 'diff widthProfile was not adopted.';
  const operations = diff['operations'].flatMap((operation) =>
    isNonArrayObject(operation) ? [adoptions.operations.get(operation)].filter(isDefined) : []);
  const cursor = isNonArrayObject(diff['cursor']) ? adoptions.cursors.get(diff['cursor']) : undefined;
  const canvasStyle = isNonArrayObject(diff['canvasStyle']) ? adoptions.styles.get(diff['canvasStyle']) : undefined;
  adoptions.diffs.set(diff, Object.freeze({
    width,
    height,
    widthProfile: normalizedWidthProfile,
    ...(canvasStyle === undefined ? {} : { canvasStyle }),
    operations: Object.freeze(operations),
    graphicOperations: Object.freeze(graphicOperations),
    ...(cursor === undefined ? {} : { cursor }),
    fullRewrite: diff['fullRewrite'],
    ...(Array.isArray(diff['dirtyRegions'])
      ? { dirtyRegions: Object.freeze(diff['dirtyRegions'].flatMap((rect) =>
          isNonArrayObject(rect) ? [decodedRect(rect)] : [])) }
      : {})
  }));
  return undefined;
}

function textWidthProfileIssue(value: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknownField = findUnsupportedField(value, textWidthProfileFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  try {
    adoptions.widthProfiles.set(value, defineTextWidthProfile(value));
    return undefined;
  } catch (cause) {
    return errorMessage(cause);
  }
}

function renderOperationIssue(
  operation: unknown,
  width: number,
  height: number,
  widthProfile: TextWidthProfile,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (!isNonArrayObject(operation)) return 'operation must be an object.';
  switch (operation['kind']) {
    case 'write': {
      const unknownField = findUnsupportedField(operation, writeOperationFields);
      if (unknownField !== undefined) {
        return `write contains unsupported field: ${unknownField}.`;
      }
      if (!isIntegerAtLeast(operation['row'], 1) || !isIntegerAtLeast(operation['column'], 1)) {
        return 'write requires positive integer row and column.';
      }
      const row = Number(operation['row']);
      const column = Number(operation['column']);
      if (!Array.isArray(operation['spans']) || operation['spans'].length === 0) {
        return 'write requires at least one span.';
      }
      let columns = 0;
      const spans: RenderSpan[] = [];
      for (const item of operation['spans']) {
        if (!isNonArrayObject(item) || typeof item['text'] !== 'string') {
          return 'write spans must contain text.';
        }
        const unknownField = findUnsupportedField(item, renderSpanFields);
        if (unknownField !== undefined) {
          return `write span contains unsupported field: ${unknownField}.`;
        }
        const style = terminalStyleIssue(item['style'], 'write span style', adoptions);
        if (style !== undefined) return style;
        const link = terminalLinkIssue(item['link']);
        if (link !== undefined) return `write span link: ${link}`;
        const sourceIssue = frameCellSourceIssue(item['source']);
        if (sourceIssue !== undefined) return `write span source: ${sourceIssue}`;
        columns += measureTextCells(item['text'], { widthProfile }).cells;
        spans.push(decodedRenderSpan(item, adoptions));
      }
      if (columns <= 0) return 'write must affect at least one terminal cell.';
      if (row > height || column + columns - 1 > width) {
        return 'write must fit within the declared frame.';
      }
      adoptions.operations.set(operation, Object.freeze({
        kind: 'write',
        row,
        column,
        spans: Object.freeze(spans)
      }));
      return undefined;
    }
    case 'clearRect': {
      const unknownField = findUnsupportedField(operation, clearRectOperationFields);
      if (unknownField !== undefined) {
        return `clearRect contains unsupported field: ${unknownField}.`;
      }
      const issue = boundedRectIssue(operation['bounds'], width, height);
      if (issue !== undefined) return issue;
      const styleIssue = terminalStyleIssue(operation['style'], 'clearRect style', adoptions);
      if (styleIssue !== undefined) return styleIssue;
      if (isNonArrayObject(operation['bounds'])) {
        const style = isNonArrayObject(operation['style'])
          ? adoptions.styles.get(operation['style'])
          : undefined;
        adoptions.operations.set(operation, Object.freeze({
          kind: 'clearRect',
          bounds: decodedRect(operation['bounds']),
          ...(style === undefined ? {} : { style })
        }));
      }
      return undefined;
    }
    default:
      return `unsupported diff operation kind: ${String(operation['kind'])}.`;
  }
}

function frameCellSourceIssue(source: unknown): string | undefined {
  if (source === undefined) return undefined;
  if (!isNonArrayObject(source)) return 'must be an object.';
  const unknownField = findUnsupportedField(source, frameCellSourceFields);
  if (unknownField !== undefined) return `unsupported field: ${unknownField}.`;
  for (const field of [
    'elementId',
    'elementKind',
    'rendererFamily',
    'partName',
    'partType',
    'itemId',
    'description'
  ] as const) {
    if (source[field] !== undefined && typeof source[field] !== 'string') {
      return `${field} must be a string.`;
    }
  }
  if (source['itemIndex'] !== undefined && !isIntegerAtLeast(source['itemIndex'], 0)) {
    return 'itemIndex must be a non-negative integer.';
  }
  if (source['cellRole'] !== undefined && !isFrameCellRole(source['cellRole'])) {
    return 'cellRole must identify a supported frame-cell role.';
  }
  if (
    source['interactionState'] !== undefined
    && !isFrameCellInteractionState(source['interactionState'])
  ) {
    return 'interactionState must be focused, hovered, pressed, selected, disabled, or active.';
  }
  return undefined;
}

function terminalStyleIssue(
  style: unknown,
  subject: string,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (style === undefined) return undefined;
  try {
    if (!isNonArrayObject(style)) return `${subject} must be an object.`;
    const normalized = decodeTerminalStyle(style, subject);
    adoptions.styles.set(style, normalized);
    return undefined;
  } catch (cause) {
    return errorMessage(cause);
  }
}

function terminalLinkIssue(link: unknown): string | undefined {
  if (link === undefined) return undefined;
  if (!isNonArrayObject(link)) return 'must be an object.';
  const unknownField = findUnsupportedField(link, terminalLinkFields);
  if (unknownField !== undefined) return `unsupported field: ${unknownField}.`;
  if (typeof link['href'] !== 'string') return 'href must be a string.';
  if (link['id'] !== undefined && typeof link['id'] !== 'string') return 'id must be a string.';
  return undefined;
}

function decodedFrameCell(
  cell: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): FrameCell {
  const style = isNonArrayObject(cell['style']) ? adoptions.styles.get(cell['style']) : undefined;
  return Object.freeze({
    row: Number(cell['row']),
    column: Number(cell['column']),
    text: String(cell['text']),
    width: Number(cell['width']),
    ...(style === undefined ? {} : { style }),
    ...decodedLinkField(cell['link']),
    ...decodedSourceField(cell['source']),
    ...(typeof cell['continuation'] === 'boolean' ? { continuation: cell['continuation'] } : {})
  });
}

function decodedCursor(
  cursor: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): CursorPosition {
  const style = isNonArrayObject(cursor['style']) ? adoptions.styles.get(cursor['style']) : undefined;
  return Object.freeze({
    row: Number(cursor['row']),
    column: Number(cursor['column']),
    ...(style === undefined ? {} : { style }),
    ...decodedSourceField(cursor['source'])
  });
}

function decodedRenderSpan(
  span: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): RenderSpan {
  const style = isNonArrayObject(span['style']) ? adoptions.styles.get(span['style']) : undefined;
  return Object.freeze({
    text: String(span['text']),
    ...(style === undefined ? {} : { style }),
    ...decodedLinkField(span['link']),
    ...decodedSourceField(span['source'])
  });
}

function decodedLinkField(value: unknown): { readonly link?: TerminalLink } {
  if (!isNonArrayObject(value) || typeof value['href'] !== 'string') return {};
  return { link: Object.freeze({
    href: value['href'],
    ...(typeof value['id'] === 'string' ? { id: value['id'] } : {})
  }) };
}

function decodedSourceField(value: unknown): { readonly source?: FrameCellSource } {
  if (!isNonArrayObject(value)) return {};
  return { source: Object.freeze({
    ...(typeof value['elementId'] === 'string' ? { elementId: value['elementId'] } : {}),
    ...(typeof value['elementKind'] === 'string' ? { elementKind: value['elementKind'] } : {}),
    ...(typeof value['rendererFamily'] === 'string' ? { rendererFamily: value['rendererFamily'] } : {}),
    ...(isFrameCellRole(value['cellRole']) ? { cellRole: value['cellRole'] } : {}),
    ...(typeof value['partName'] === 'string' ? { partName: value['partName'] } : {}),
    ...(typeof value['partType'] === 'string' ? { partType: value['partType'] } : {}),
    ...(typeof value['itemId'] === 'string' ? { itemId: value['itemId'] } : {}),
    ...(typeof value['itemIndex'] === 'number' ? { itemIndex: value['itemIndex'] } : {}),
    ...(isFrameCellInteractionState(value['interactionState'])
      ? { interactionState: value['interactionState'] }
      : {}),
    ...(typeof value['description'] === 'string' ? { description: value['description'] } : {})
  }) };
}

function frameHitTargetIssue(target: unknown, width: number, height: number): string | undefined {
  if (!isNonArrayObject(target)) return 'must be an object.';
  const unknownField = findUnsupportedField(target, frameHitTargetFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  if (!isNonEmptyString(target['id'])) return 'id must be a non-empty string.';
  const bounds = frameRectIssue(target['bounds'], width, height);
  if (bounds !== undefined) return `bounds: ${bounds}`;
  if (target['accepts'] !== undefined) {
    if (!Array.isArray(target['accepts'])
      || target['accepts'].some((kind) => !isStringMember(kind, pointerEventKinds))
      || new Set(target['accepts']).size !== target['accepts'].length) {
      return 'accepts must contain unique supported pointer event kinds.';
    }
  }
  const focus = target['focus'];
  if (focus !== undefined) {
    if (!isNonArrayObject(focus)) return 'focus must be an object.';
    if (focus['kind'] === 'focus') {
      const unknownField = findUnsupportedField(focus, resolvedFocusFields);
      if (unknownField !== undefined) {
        return `focus contains unsupported field: ${unknownField}.`;
      }
      if (!isStringArray(focus['path']) || focus['path'].length === 0) {
        return 'focus path must be a non-empty string array.';
      }
    } else if (focus['kind'] === 'preserve') {
      const unknownField = findUnsupportedField(focus, preservedFocusFields);
      if (unknownField !== undefined) {
        return `focus contains unsupported field: ${unknownField}.`;
      }
    } else {
      return 'focus must be a resolved focus or preserve intent.';
    }
  }
  if (target['cursor'] !== undefined
    && !isStringMember(target['cursor'], ['pointer', 'text', 'default'] as const)) {
    return 'cursor must be pointer, text, or default.';
  }
  if (target['zIndex'] !== undefined && !Number.isSafeInteger(target['zIndex'])) {
    return 'zIndex must be a safe integer.';
  }
  return undefined;
}

function decodedFrameHitTarget(target: Readonly<Record<string, unknown>>): FrameHitTarget {
  const focus = target['focus'];
  if (!isNonArrayObject(target['bounds'])) {
    throw new Error('Validated frame hit target bounds are missing.');
  }
  return Object.freeze({
    id: String(target['id']),
    bounds: decodedRect(target['bounds']),
    ...(Array.isArray(target['accepts'])
      ? { accepts: Object.freeze(target['accepts'].filter(isPointerEventKind)) }
      : {}),
    ...(isNonArrayObject(focus) && focus['kind'] === 'preserve'
      ? { focus: Object.freeze({ kind: 'preserve' as const }) }
      : isNonArrayObject(focus) && focus['kind'] === 'focus' && Array.isArray(focus['path'])
        ? { focus: Object.freeze({
            kind: 'focus' as const,
            path: Object.freeze(focus['path'].filter((item): item is string => typeof item === 'string'))
          }) }
        : {}),
    ...(target['cursor'] === 'pointer' || target['cursor'] === 'text' || target['cursor'] === 'default'
      ? { cursor: target['cursor'] }
      : {}),
    ...(typeof target['zIndex'] === 'number' ? { zIndex: target['zIndex'] } : {})
  });
}

function isPointerEventKind(value: unknown): value is NonNullable<FrameHitTarget['accepts']>[number] {
  return isStringMember(value, pointerEventKinds);
}

function decodedGraphicOperation(
  value: unknown,
  width: number,
  height: number,
): GraphicOperationDescriptor | string {
  if (!isNonArrayObject(value)) return 'must be an object.';
  if (value['kind'] === 'remove') {
    const unknown = findUnsupportedField(value, removeGraphicOperationFields);
    if (unknown !== undefined) return `remove contains unsupported field: ${unknown}.`;
    return isNonEmptyString(value['id'])
      ? Object.freeze({ kind: 'remove', id: value['id'] })
      : 'remove requires a non-empty id.';
  }
  if (value['kind'] !== 'place') return 'kind must be place or remove.';
  const unknown = findUnsupportedField(value, placeGraphicOperationFields);
  if (unknown !== undefined) return `place contains unsupported field: ${unknown}.`;
  const placement = decodedGraphicPlacement(value['placement'], width, height);
  return typeof placement === 'string' ? placement : Object.freeze({ kind: 'place', placement });
}

function decodedGraphicPlacement(
  value: unknown,
  width: number,
  height: number,
): GraphicPlacementDescriptor | string {
  if (!isNonArrayObject(value)) return 'placement must be an object.';
  const unknown = findUnsupportedField(value, graphicPlacementFields);
  if (unknown !== undefined) return `placement contains unsupported field: ${unknown}.`;
  if (!isNonEmptyString(value['id'])) return 'placement id must be non-empty.';
  if (value['fit'] !== 'contain' && value['fit'] !== 'cover' && value['fit'] !== 'fill') {
    return 'placement fit must be contain, cover, or fill.';
  }
  const boundsIssue = graphicBoundsIssue(value['bounds']);
  if (boundsIssue !== undefined) return `placement bounds ${boundsIssue}`;
  const clipIssue = boundedRectIssue(value['clip'], width, height);
  if (clipIssue !== undefined) return `placement clip ${clipIssue}`;
  const image = decodedRasterImage(value['image']);
  if (typeof image === 'string') return `placement image ${image}`;
  if (!isNonArrayObject(value['bounds']) || !isNonArrayObject(value['clip'])) return 'placement rectangles were not decoded.';
  const bounds = decodedRect(value['bounds']);
  const clip = decodedRect(value['clip']);
  if (!rectContains(bounds, clip)) return 'placement bounds must contain its clip.';
  return Object.freeze({ id: value['id'], image, bounds, clip, fit: value['fit'] });
}

function decodedRasterImage(value: unknown): RasterImageDescriptor | string {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknown = findUnsupportedField(value, rasterImageFields);
  if (unknown !== undefined) return `contains unsupported field: ${unknown}.`;
  if (!isIntegerAtLeast(value['width'], 1) || !isIntegerAtLeast(value['height'], 1)) {
    return 'dimensions must be positive integers.';
  }
  if (value['format'] !== 'rgb8' && value['format'] !== 'rgba8') return 'format must be rgb8 or rgba8.';
  const expected = Number(value['width']) * Number(value['height']) * (value['format'] === 'rgb8' ? 3 : 4);
  if (!Number.isSafeInteger(expected) || value['byteLength'] !== expected) return 'byteLength does not match dimensions and format.';
  if (typeof value['contentDigest'] !== 'string' || !/^raster:sha256:[0-9a-f]{64}$/u.test(value['contentDigest'])) {
    return 'contentDigest must be a canonical raster SHA-256 identity.';
  }
  return Object.freeze({
    width: Number(value['width']),
    height: Number(value['height']),
    format: value['format'],
    byteLength: expected,
    contentDigest: value['contentDigest'],
  });
}

function graphicBoundsIssue(value: unknown): string | undefined {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknown = findUnsupportedField(value, rectFields);
  if (unknown !== undefined) return `contain unsupported field: ${unknown}.`;
  return Number.isSafeInteger(value['row'])
    && Number.isSafeInteger(value['column'])
    && isIntegerAtLeast(value['width'], 1)
    && isIntegerAtLeast(value['height'], 1)
    && Number.isSafeInteger(Number(value['row']) + Number(value['height']))
    && Number.isSafeInteger(Number(value['column']) + Number(value['width']))
    ? undefined
    : 'must contain safe integer coordinates and positive dimensions.';
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.row >= outer.row
    && inner.column >= outer.column
    && inner.row + inner.height <= outer.row + outer.height
    && inner.column + inner.width <= outer.column + outer.width;
}

function frameRectIssue(rect: unknown, width: number, height: number): string | undefined {
  if (!isNonArrayObject(rect)) return 'must be an object.';
  const unknownField = findUnsupportedField(rect, rectFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(rect['row'], 1)
    || !isIntegerAtLeast(rect['column'], 1)
    || !isIntegerAtLeast(rect['width'], 0)
    || !isIntegerAtLeast(rect['height'], 0)) {
    return 'must contain positive integer coordinates and non-negative integer dimensions.';
  }
  return Number(rect['row']) + Number(rect['height']) - 1 <= height
    && Number(rect['column']) + Number(rect['width']) - 1 <= width
    ? undefined
    : 'must fit within the declared frame.';
}

function decodedRect(rect: Readonly<Record<string, unknown>>): Rect {
  return Object.freeze({
    row: Number(rect['row']),
    column: Number(rect['column']),
    width: Number(rect['width']),
    height: Number(rect['height'])
  });
}

function rectIssue(rect: unknown): string | undefined {
  if (!isNonArrayObject(rect)) return 'clearRect bounds must be an object.';
  const unknownField = findUnsupportedField(rect, rectFields);
  if (unknownField !== undefined) return `bounds contain unsupported field: ${unknownField}.`;
  return isIntegerAtLeast(rect['row'], 1)
    && isIntegerAtLeast(rect['column'], 1)
    && isIntegerAtLeast(rect['width'], 1)
    && isIntegerAtLeast(rect['height'], 1)
    ? undefined
    : 'clearRect bounds must contain row, column, width, and height.';
}

function boundedRectIssue(rect: unknown, width: number, height: number): string | undefined {
  const issue = rectIssue(rect);
  if (issue !== undefined) return issue;
  if (!isNonArrayObject(rect)) return 'bounds must be an object.';
  return Number(rect['row']) + Number(rect['height']) - 1 <= height
    && Number(rect['column']) + Number(rect['width']) - 1 <= width
    ? undefined
    : 'bounds must fit within the declared frame.';
}

function pointFits(point: Record<string, unknown>, width: number, height: number): boolean {
  return typeof point['row'] === 'number'
    && typeof point['column'] === 'number'
    && point['row'] <= height
    && point['column'] <= width;
}

function decodeSnapshot(snapshot: unknown): AccessibleSnapshot | string {
  const result = decodeAccessibleSnapshot(snapshot);
  if (result.status === 'failure') return result.error.message;
  return result.value;
}

function restoreResultIssue(result: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(result)) return 'restore result must be an object.';
  const unknownField = findUnsupportedField(result, restoreResultFields);
  if (unknownField !== undefined) {
    return `restore result contains unsupported field: ${unknownField}.`;
  }
  const typed = result as Partial<TerminalRestoreResult>;
  if (!isStringMember(typed.status, ['restored', 'partial', 'failed'] as const)) return 'restore result requires status.';
  if (!isStringMember(typed.reason, ['success', 'cancelled', 'interrupted', 'timeout', 'error', 'disposed'] as const)) {
    return 'restore result requires reason.';
  }
  const requestedIssue = terminalStateSnapshotIssue(typed.requested, adoptions);
  if (requestedIssue !== undefined) return `restore requested state: ${requestedIssue}`;
  const resultingIssue = terminalStateSnapshotIssue(typed.resultingState, adoptions);
  if (resultingIssue !== undefined) return `restore resulting state: ${resultingIssue}`;
  if (!Array.isArray(typed.attempted)) return 'restore result requires attempted.';
  const attempted: TerminalStateChange[] = [];
  for (const operation of typed.attempted) {
    const issue = terminalStateChangeIssue(operation, adoptions);
    if (issue !== undefined) return `restore attempted: ${issue}`;
    if (isNonArrayObject(operation)) {
      const adopted = adoptions.stateChanges.get(operation);
      if (adopted !== undefined) attempted.push(withoutAssurance(adopted));
    }
  }
  if (!Array.isArray(typed.completed)) return 'restore result requires completed.';
  const completed: TerminalRestoreCompletion[] = [];
  for (const operation of typed.completed) {
    const issue = terminalRestoreCompletionIssue(operation, adoptions);
    if (issue !== undefined) return `restore completed: ${issue}`;
    if (isNonArrayObject(operation)) {
      const adopted = adoptions.stateChanges.get(operation);
      if (adopted !== undefined && 'assurance' in adopted) completed.push(adopted);
    }
  }
  if (!isOrderedTerminalStateChangeSubset(completed, attempted)) {
    return 'restore completed operations must be an ordered subset of attempted operations.';
  }
  if (!Array.isArray(typed.diagnostics)) return 'restore result requires diagnostics.';
  const diagnostics = [];
  for (const item of typed.diagnostics) {
    const issue = decodeDiagnosticIssue(item, adoptions);
    if (issue !== undefined) return `restore diagnostic: ${issue}`;
    if (isNonArrayObject(item)) {
      const adopted = adoptions.diagnostics.get(item);
      if (adopted !== undefined) diagnostics.push(adopted);
    }
  }
  if (!isNonArrayObject(typed.requested) || !isNonArrayObject(typed.resultingState)) {
    return 'restore state snapshots were not adopted.';
  }
  const requested = adoptions.stateSnapshots.get(typed.requested);
  const resultingState = adoptions.stateSnapshots.get(typed.resultingState);
  if (requested === undefined || resultingState === undefined) return 'restore state snapshots were not adopted.';
  adoptions.restores.set(result, Object.freeze({
    status: typed.status,
    reason: typed.reason,
    requested,
    attempted: Object.freeze(attempted),
    completed: Object.freeze(completed),
    resultingState,
    diagnostics: Object.freeze(diagnostics)
  }));
  return undefined;
}

function terminalRestoreCompletionIssue(
  completion: unknown,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (!isNonArrayObject(completion)) return 'terminal restore completion must be an object.';
  const unknownField = findUnsupportedField(completion, terminalRestoreCompletionFields);
  if (unknownField !== undefined) {
    return `terminal restore completion contains unsupported field: ${unknownField}.`;
  }
  if (!isStringMember(completion['assurance'], ['observed', 'sent'] as const)) {
    return 'terminal restore completion requires assurance.';
  }
  return terminalStateChangeIssue(completion, adoptions, true);
}

function isOrderedTerminalStateChangeSubset(
  subset: readonly TerminalStateChange[],
  values: readonly TerminalStateChange[]
): boolean {
  let valueIndex = 0;
  for (const candidate of subset) {
    let matched = false;
    while (valueIndex < values.length) {
      const value = values[valueIndex];
      valueIndex += 1;
      if (value !== undefined && terminalStateChangesEqual(candidate, value)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function terminalStateChangesEqual(left: TerminalStateChange, right: TerminalStateChange): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'keyboardProfile' && right.kind === 'keyboardProfile') {
    return left.state.kind === right.state.kind
      && (left.state.kind === 'legacy'
        || (right.state.kind === 'kitty' && left.state.flags === right.state.flags));
  }
  if (left.kind === 'mouseReporting' && right.kind === 'mouseReporting') {
    return left.state.tracking === right.state.tracking
      && left.state.encoding === right.state.encoding;
  }
  return left.state === right.state;
}

function terminalStateSnapshotIssue(
  checkpoint: unknown,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (!isNonArrayObject(checkpoint)) return 'terminal state must be an object.';
  const unknownField = findUnsupportedField(checkpoint, terminalStateFields);
  if (unknownField !== undefined) return `terminal state contains unsupported field: ${unknownField}.`;
  const typed = checkpoint as Partial<TerminalStateSnapshot>;
  if (typeof typed.rawInput !== 'boolean') return 'terminal state requires rawInput.';
  if (typeof typed.alternateScreen !== 'boolean') return 'terminal state requires alternateScreen.';
  if (typeof typed.bracketedPaste !== 'boolean') return 'terminal state requires bracketedPaste.';
  if (mouseReportingStateIssue(typed.mouseReporting) !== undefined) {
    return 'terminal state requires mouseReporting.';
  }
  if (typeof typed.focusReporting !== 'boolean') return 'terminal state requires focusReporting.';
  if (typeof typed.unicodeGraphemeMode !== 'boolean') return 'terminal state requires unicodeGraphemeMode.';
  const keyboardProfileIssue = terminalKeyboardProfileIssue(typed.keyboardProfile, adoptions);
  if (keyboardProfileIssue !== undefined) return `terminal state keyboardProfile: ${keyboardProfileIssue}`;
  if (typeof typed.cursorVisible !== 'boolean') return 'terminal state requires cursorVisible.';
  if (!isNonArrayObject(typed.provenance)) return 'terminal state requires provenance.';
  const provenanceField = findUnsupportedField(typed.provenance, terminalStateProvenanceFields);
  if (provenanceField !== undefined) {
    return `terminal state provenance contains unsupported field: ${provenanceField}.`;
  }
  for (const key of ['rawInput', 'alternateScreen', 'bracketedPaste', 'mouseReporting', 'focusReporting', 'unicodeGraphemeMode', 'keyboardProfile', 'cursorVisible'] as const) {
    if (!isStringMember(typed.provenance[key], ['observed', 'explicit', 'library_known', 'assumed', 'indeterminate'] as const)) {
      return `terminal state provenance requires ${key}.`;
    }
  }
  if (!isNonArrayObject(typed.mouseReporting) || !isNonArrayObject(typed.keyboardProfile)) {
    return 'terminal state protocol values were not adopted.';
  }
  const keyboardProfile = adoptions.keyboardProfiles.get(typed.keyboardProfile);
  if (keyboardProfile === undefined) return 'terminal state keyboardProfile was not adopted.';
  adoptions.stateSnapshots.set(checkpoint, Object.freeze({
    rawInput: typed.rawInput,
    alternateScreen: typed.alternateScreen,
    bracketedPaste: typed.bracketedPaste,
    mouseReporting: decodedMouseReportingState(typed.mouseReporting),
    focusReporting: typed.focusReporting,
    unicodeGraphemeMode: typed.unicodeGraphemeMode,
    keyboardProfile,
    cursorVisible: typed.cursorVisible,
    provenance: Object.freeze({
      rawInput: typed.provenance.rawInput,
      alternateScreen: typed.provenance.alternateScreen,
      bracketedPaste: typed.provenance.bracketedPaste,
      mouseReporting: typed.provenance.mouseReporting,
      focusReporting: typed.provenance.focusReporting,
      unicodeGraphemeMode: typed.provenance.unicodeGraphemeMode,
      keyboardProfile: typed.provenance.keyboardProfile,
      cursorVisible: typed.provenance.cursorVisible
    })
  }));
  return undefined;
}

function terminalStateChangeIssue(
  operation: unknown,
  adoptions: TranscriptAdoptions,
  completion = false
): string | undefined {
  if (!isNonArrayObject(operation)) return 'terminal state change must be an object.';
  const unknownField = findUnsupportedField(
    operation,
    completion ? terminalRestoreCompletionFields : terminalStateChangeFields
  );
  if (unknownField !== undefined) {
    return `terminal state change contains unsupported field: ${unknownField}.`;
  }
  const typed = operation as Partial<TerminalStateChange>;
  let change: TerminalStateChange;
  switch (typed.kind) {
    case 'rawInput':
    case 'alternateScreen':
    case 'bracketedPaste':
    case 'focusReporting':
    case 'unicodeGraphemeMode':
    case 'cursorVisible':
      if (typeof typed.state !== 'boolean') return `${typed.kind} requires a boolean state.`;
      change = Object.freeze({ kind: typed.kind, state: typed.state });
      break;
    case 'mouseReporting': {
      const issue = mouseReportingStateIssue(typed.state);
      if (issue !== undefined) return issue;
      if (!isNonArrayObject(typed.state)) return 'mouseReporting requires an object.';
      change = Object.freeze({ kind: typed.kind, state: decodedMouseReportingState(typed.state) });
      break;
    }
    case 'keyboardProfile': {
      const issue = terminalKeyboardProfileIssue(typed.state, adoptions);
      if (issue !== undefined) return issue;
      if (!isNonArrayObject(typed.state)) return 'keyboardProfile requires an object.';
      const profile = adoptions.keyboardProfiles.get(typed.state);
      if (profile === undefined) return 'keyboardProfile was not adopted.';
      change = Object.freeze({ kind: typed.kind, state: profile });
      break;
    }
    default:
      return 'terminal state change requires a valid kind.';
  }
  adoptions.stateChanges.set(operation, completion
    ? Object.freeze({ ...change, assurance: operation['assurance'] === 'observed' ? 'observed' : 'sent' })
    : change);
  return undefined;
}

function mouseReportingStateIssue(state: unknown): string | undefined {
  if (!isNonArrayObject(state)) return 'mouseReporting requires an object.';
  const unknown = findUnsupportedField(state, mouseReportingStateFields);
  if (unknown !== undefined) return `mouseReporting contains unsupported field: ${unknown}.`;
  if (!isStringMember(state['tracking'], ['none', 'click', 'drag', 'all'] as const)) {
    return 'mouseReporting requires a valid tracking mode.';
  }
  return isStringMember(state['encoding'], ['default', 'sgr'] as const)
    ? undefined
    : 'mouseReporting requires a valid encoding.';
}

function decodedMouseReportingState(
  state: Readonly<Record<string, unknown>>
): TerminalStateSnapshot['mouseReporting'] {
  const tracking = state['tracking'];
  const encoding = state['encoding'];
  if ((tracking !== 'none' && tracking !== 'click' && tracking !== 'drag' && tracking !== 'all')
    || (encoding !== 'default' && encoding !== 'sgr')) {
    throw new Error('Validated mouse-reporting state is invalid.');
  }
  return Object.freeze({ tracking, encoding });
}

function withoutAssurance(
  change: TerminalStateChange | TerminalRestoreCompletion
): TerminalStateChange {
  if (!('assurance' in change)) return change;
  const { assurance, ...stateChange } = change;
  void assurance;
  return Object.freeze(stateChange);
}

function terminalSizeIssue(terminalSize: unknown): string | undefined {
  if (!isNonArrayObject(terminalSize)) return 'terminal size must be an object.';
  const unknownField = findUnsupportedField(terminalSize, terminalSizeFields);
  if (unknownField !== undefined) return `terminal size contains unsupported field: ${unknownField}.`;
  const typed = terminalSize as Partial<TerminalSize>;
  return isIntegerAtLeast(typed.columns, 1) && isIntegerAtLeast(typed.rows, 1)
    ? undefined
    : 'terminal size columns and rows must be positive integers.';
}

function terminalKeyboardProfileIssue(
  profile: unknown,
  adoptions: TranscriptAdoptions
): string | undefined {
  try {
    if (!isNonArrayObject(profile)) return 'Terminal keyboard profile must be an object.';
    const kind = profile['kind'];
    const supported = kind === 'legacy'
      ? legacyKeyboardProfileFields
      : kind === 'kitty' ? kittyKeyboardProfileFields : undefined;
    if (supported === undefined) return 'Terminal keyboard profile kind must be legacy or kitty.';
    const unknown = findUnsupportedField(profile, supported);
    if (unknown !== undefined) {
      return `Terminal keyboard profile contains unsupported field: ${unknown}.`;
    }
    if (kind === 'legacy') {
      adoptions.keyboardProfiles.set(profile, LEGACY_KEYBOARD_PROFILE);
      return undefined;
    }
    const flags = profile['flags'];
    if (typeof flags !== 'number') return 'Kitty keyboard profile flags must be a number.';
    adoptions.keyboardProfiles.set(profile, kittyKeyboardProfile(flags));
    return undefined;
  } catch (cause) {
    return cause instanceof Error
      ? cause.message
      : 'keyboardProfile must be a valid legacy or Kitty profile.';
  }
}

function transcriptFailure(message: string): Result<never> {
  return failure(diagnostic('TRANSCRIPT_REPLAY_FAILED', message));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIntegerAtLeast(value: unknown, min: number): boolean {
  return Number.isInteger(value) && Number(value) >= min;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
