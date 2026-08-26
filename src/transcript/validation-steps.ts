import { decodeDiagnosticOccurrence, decodeTerminalDiagnostic } from '../diagnostics.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isNonEmptyString,
  isStringMember,
} from '../foundation/validation.ts';
import type { JsonValue } from '../foundation/json.ts';
import type {
  TerminalRestoreCompletion,
  TerminalRestoreResult,
  TerminalStateChange,
  TerminalStateSnapshot,
  TerminalSize,
} from '../host/index.ts';
import { decodeInputEvent } from '../input/index.ts';
import { tuiMessageSources } from '../interaction/message.ts';
import { LEGACY_KEYBOARD_PROFILE, kittyKeyboardProfile } from '../protocol/index.ts';
import { decodeSnapshot, frameIssue, renderDiffIssue } from './validation-rendering.ts';
import type { TranscriptAdoptions } from './validation-adoptions.ts';
import type {
  InteractionTranscriptStep,
  TranscriptRuntimeCommit,
} from './types.ts';

const transcriptStepFields: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  input: new Set(['kind', 'event']),
  message: new Set(['kind', 'source', 'fidelity', 'message']),
  commit: new Set(['kind', 'commit']),
  snapshot: new Set(['kind', 'snapshot']),
  diagnostic: new Set(['kind', 'occurrence']),
  restore: new Set(['kind', 'phase', 'result']),
});
const commitFields = new Set(['id', 'stateVersion', 'terminalSize', 'focusPath', 'frame', 'diff']);
const terminalSizeFields = new Set(['columns', 'rows']);
const restoreResultFields = new Set([
  'status', 'reason', 'requested', 'attempted', 'completed', 'resultingState', 'diagnostics',
]);
const terminalStateFields = new Set([
  'rawInput', 'alternateScreen', 'bracketedPaste', 'mouseReporting', 'focusReporting',
  'unicodeGraphemeMode', 'keyboardProfile', 'cursorVisible', 'provenance',
]);
const terminalStateProvenanceFields = new Set([
  'rawInput', 'alternateScreen', 'bracketedPaste', 'mouseReporting', 'focusReporting',
  'unicodeGraphemeMode', 'keyboardProfile', 'cursorVisible',
]);
const terminalStateChangeFields = new Set(['kind', 'state']);
const terminalRestoreCompletionFields = new Set(['kind', 'state', 'assurance']);
const mouseReportingStateFields = new Set(['tracking', 'encoding']);
const legacyKeyboardProfileFields = new Set(['kind']);
const kittyKeyboardProfileFields = new Set(['kind', 'flags']);

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIntegerAtLeast(value: unknown, min: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

export function transcriptDiagnosticOccurrenceIssue(
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

export function decodeTranscriptOccurrence(value: unknown): DiagnosticOccurrence | string {
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

export function decodeTranscriptStep(step: unknown, adoptions: TranscriptAdoptions): InteractionTranscriptStep | string {
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
      const occurrence = decodeTranscriptOccurrence(step['occurrence']);
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


function restoreResultIssue(result: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(result)) return 'restore result must be an object.';
  return adoptedRestoreResultIssue(result, adoptions);
}

function adoptedRestoreResultIssue(
  result: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions,
): string | undefined {
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
  const attempted = adoptAttemptedRestoreOperations(typed.attempted, adoptions);
  if (typeof attempted === 'string') return attempted;
  const completed = adoptCompletedRestoreOperations(typed.completed, adoptions);
  if (typeof completed === 'string') return completed;
  if (!isOrderedTerminalStateChangeSubset(completed, attempted)) {
    return 'restore completed operations must be an ordered subset of attempted operations.';
  }
  const diagnostics = adoptRestoreDiagnostics(typed.diagnostics, adoptions);
  if (typeof diagnostics === 'string') return diagnostics;
  return retainAdoptedRestoreResult(
    result,
    typed.status,
    typed.reason,
    typed.requested,
    typed.resultingState,
    attempted,
    completed,
    diagnostics,
    adoptions,
  );
}

function adoptAttemptedRestoreOperations(
  value: unknown,
  adoptions: TranscriptAdoptions,
): readonly TerminalStateChange[] | string {
  if (!Array.isArray(value)) return 'restore result requires attempted.';
  const attempted: TerminalStateChange[] = [];
  for (const operation of value) {
    const issue = terminalStateChangeIssue(operation, adoptions);
    if (issue !== undefined) return `restore attempted: ${issue}`;
    if (isNonArrayObject(operation)) {
      const adopted = adoptions.stateChanges.get(operation);
      if (adopted !== undefined) attempted.push(withoutAssurance(adopted));
    }
  }
  return Object.freeze(attempted);
}

function adoptCompletedRestoreOperations(
  value: unknown,
  adoptions: TranscriptAdoptions,
): readonly TerminalRestoreCompletion[] | string {
  if (!Array.isArray(value)) return 'restore result requires completed.';
  const completed: TerminalRestoreCompletion[] = [];
  for (const operation of value) {
    const issue = terminalRestoreCompletionIssue(operation, adoptions);
    if (issue !== undefined) return `restore completed: ${issue}`;
    if (isNonArrayObject(operation)) {
      const adopted = adoptions.stateChanges.get(operation);
      if (adopted !== undefined && 'assurance' in adopted) completed.push(adopted);
    }
  }
  return Object.freeze(completed);
}

function adoptRestoreDiagnostics(
  value: unknown,
  adoptions: TranscriptAdoptions,
): readonly TerminalDiagnostic[] | string {
  if (!Array.isArray(value)) return 'restore result requires diagnostics.';
  const diagnostics: TerminalDiagnostic[] = [];
  for (const item of value) {
    const issue = decodeDiagnosticIssue(item, adoptions);
    if (issue !== undefined) return `restore diagnostic: ${issue}`;
    if (isNonArrayObject(item)) {
      const adopted = adoptions.diagnostics.get(item);
      if (adopted !== undefined) diagnostics.push(adopted);
    }
  }
  return Object.freeze(diagnostics);
}

function retainAdoptedRestoreResult(
  result: Readonly<Record<string, unknown>>,
  status: TerminalRestoreResult['status'],
  reason: TerminalRestoreResult['reason'],
  requestedValue: unknown,
  resultingStateValue: unknown,
  attempted: readonly TerminalStateChange[],
  completed: readonly TerminalRestoreCompletion[],
  diagnostics: readonly TerminalDiagnostic[],
  adoptions: TranscriptAdoptions,
): string | undefined {
  if (!isNonArrayObject(requestedValue) || !isNonArrayObject(resultingStateValue)) {
    return 'restore state snapshots were not adopted.';
  }
  const requested = adoptions.stateSnapshots.get(requestedValue);
  const resultingState = adoptions.stateSnapshots.get(resultingStateValue);
  if (requested === undefined || resultingState === undefined) return 'restore state snapshots were not adopted.';
  adoptions.restores.set(result, Object.freeze({
    status,
    reason,
    requested,
    attempted,
    completed,
    resultingState,
    diagnostics
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
