import { validateAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic, diagnosticOccurrenceIssue, terminalDiagnosticIssue } from '../diagnostics.ts';
import { err, ok } from '../result.ts';
import { defineTextWidthProfile, measureTextCells } from '../text/index.ts';
import { isFrameCellInteractionState } from '../visual/source.ts';
import {
  applyRenderDiff,
  renderDiffProjectionMatchesFrame
} from '../renderer/internal/diff-interpreter.ts';
import type { TerminalRestoreResult, TerminalStateChange, TerminalStateSnapshot, TerminalSize } from '../host/index.ts';
import { normalizeKeyboardProfile } from '../protocol/index.ts';
import type { KeyName, MouseAction, MouseButton, MouseEncoding } from '../input/index.ts';
import type { Result } from '../result.ts';
import type { CursorPosition, Frame, RenderDiff } from '../renderer/index.ts';
import type { RenderDiffProjection } from '../renderer/internal/diff-interpreter.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TuiMessageSource } from '../runtime-model/message-source.ts';
import type { InteractionTranscript, TranscriptSource } from './types.ts';

const transcriptSources = ['prompt', 'tui', 'test', 'replay'] as const satisfies readonly TranscriptSource[];
const messageSources = ['input', 'signal', 'timer', 'external', 'effect'] as const satisfies readonly TuiMessageSource[];
const keyNames = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'enter',
  'escape',
  'tab',
  'backspace',
  'delete',
  'arrowUp',
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'pageUp',
  'pageDown',
  'home',
  'end',
  'insert',
  'space',
  'add',
  'subtract',
  'multiply',
  'divide',
  'decimal',
  'equal',
  'unknown'
] as const satisfies readonly KeyName[];
const mouseEncodings = ['sgr', 'x10'] as const satisfies readonly MouseEncoding[];
const mouseActions = ['press', 'release', 'drag', 'move', 'wheel'] as const satisfies readonly MouseAction[];
const mouseButtons = [
  'left',
  'middle',
  'right',
  'wheelUp',
  'wheelDown',
  'wheelLeft',
  'wheelRight',
  'none',
  'unknown'
] as const satisfies readonly MouseButton[];

export function validateTranscript(transcript: unknown): Result<InteractionTranscript> {
  const issue = transcriptIssue(transcript);
  if (issue !== undefined) return transcriptFailure(issue);
  return isInteractionTranscript(transcript)
    ? ok(transcript)
    : transcriptFailure('Interaction transcript failed type narrowing after validation.');
}

function isInteractionTranscript(value: unknown): value is InteractionTranscript {
  return transcriptIssue(value) === undefined;
}

function transcriptIssue(transcript: unknown): string | undefined {
  if (!isRecord(transcript)) return 'Interaction transcript must be an object.';
  if (transcript['schemaVersion'] !== 'terminal-ui.interaction-transcript.v3') {
    return 'Unsupported interaction transcript schema version.';
  }
  if (!isNonEmptyString(transcript['id'])) {
    return 'Interaction transcript id must not be empty.';
  }
  if (!isOneOf(transcript['source'], transcriptSources)) {
    return `Unsupported interaction transcript source: ${String(transcript['source'])}.`;
  }
  if (transcript['startedAt'] !== undefined && typeof transcript['startedAt'] !== 'string') {
    return 'Interaction transcript startedAt must be a string when present.';
  }
  if (!Array.isArray(transcript['steps'])) return 'Interaction transcript steps must be an array.';
  if (!Array.isArray(transcript['diagnostics'])) {
    return 'Interaction transcript diagnostics must be an array.';
  }
  if (!Array.isArray(transcript['redactions'])) {
    return 'Interaction transcript redactions must be an array.';
  }

  for (const [index, item] of transcript['steps'].entries()) {
    const issue = stepIssue(item);
    if (issue !== undefined) return `Invalid transcript step at index ${String(index)}: ${issue}`;
  }
  const orderingIssue = transcriptOrderingIssue(transcript['steps']);
  if (orderingIssue !== undefined) return orderingIssue;
  for (const [index, item] of transcript['diagnostics'].entries()) {
    const issue = diagnosticOccurrenceIssue(item);
    if (issue !== undefined) return `Invalid transcript diagnostic at index ${String(index)}: ${issue}`;
  }
  for (const [index, item] of transcript['redactions'].entries()) {
    if (!isRecord(item) || typeof item['path'] !== 'string' || typeof item['reason'] !== 'string') {
      return `Invalid transcript redaction at index ${String(index)}.`;
    }
  }

  return undefined;
}

function transcriptOrderingIssue(steps: readonly unknown[]): string | undefined {
  const commitIds = new Set<string>();
  let lastStateVersion = -1;
  let restorationSeen = false;
  let previousProjection: RenderDiffProjection | undefined;
  for (const [index, step] of steps.entries()) {
    if (!isRecord(step)) continue;
    if (step['kind'] === 'restore') {
      restorationSeen = true;
      continue;
    }
    if (step['kind'] !== 'commit' || !isRecord(step['commit'])) continue;
    if (restorationSeen) return `Transcript commit at index ${String(index)} occurs after restoration.`;
    const id = step['commit']['id'];
    const stateVersion = step['commit']['stateVersion'];
    if (typeof id === 'string') {
      if (commitIds.has(id)) return `Transcript commit id ${id} is duplicated.`;
      commitIds.add(id);
    }
    if (typeof stateVersion === 'number') {
      if (stateVersion < lastStateVersion) {
        return `Transcript commit stateVersion decreases at index ${String(index)}.`;
      }
      lastStateVersion = stateVersion;
    }
    const frame = step['commit']['frame'];
    const diff = step['commit']['diff'];
    if (!isRecord(frame) || !isRecord(diff)) continue;
    if (previousProjection === undefined && diff['fullRewrite'] !== true) {
      return `Transcript first commit at index ${String(index)} must contain a full rewrite.`;
    }
    try {
      const projection = applyRenderDiff(
        previousProjection,
        diff as unknown as RenderDiff
      );
      if (!renderDiffProjectionMatchesFrame(
        projection,
        frame as unknown as Frame
      )) {
        return `Transcript commit at index ${String(index)} diff does not reproduce its frame.`;
      }
      previousProjection = projection;
    } catch (cause) {
      return `Transcript commit at index ${String(index)} diff chain is invalid: ${errorMessage(cause)}.`;
    }
  }
  return undefined;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function stepIssue(step: unknown): string | undefined {
  if (!isRecord(step)) return 'step must be an object.';
  switch (step['kind']) {
    case 'input':
      return inputEventIssue(step['event']);
    case 'message':
      return messageStepIssue(step);
    case 'commit':
      return commitIssue(step['commit']);
    case 'snapshot':
      return snapshotIssue(step['snapshot']);
    case 'diagnostic':
      return diagnosticOccurrenceIssue(step['diagnostic']);
    case 'restore':
      return restoreResultIssue(step['result']);
    default:
      return `unsupported step kind: ${String(step['kind'])}.`;
  }
}

function commitIssue(value: unknown): string | undefined {
  if (!isRecord(value)) return 'commit must be an object.';
  if (!isNonEmptyString(value['id'])) return 'commit id must not be empty.';
  if (!isIntegerAtLeast(value['stateVersion'], 0)) return 'commit stateVersion must be a non-negative integer.';
  const terminalSize = terminalSizeIssue(value['terminalSize']);
  if (terminalSize !== undefined) return `commit terminal size: ${terminalSize}`;
  if (value['focusPath'] !== undefined && !isStringArray(value['focusPath'])) {
    return 'commit focusPath must be a string array.';
  }
  const frame = frameIssue(value['frame']);
  if (frame !== undefined) return `commit frame: ${frame}`;
  const diff = renderDiffIssue(value['diff']);
  if (diff !== undefined) return `commit diff: ${diff}`;
  if (!isRecord(value['terminalSize']) || !isRecord(value['frame']) || !isRecord(value['diff'])) {
    return 'commit projection is incomplete.';
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
  return undefined;
}

function sameWidthProfile(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return left === right;
  return left['emoji'] === right['emoji'] && left['ambiguous'] === right['ambiguous'];
}

function sameOptionalStringArray(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (!isStringArray(left) || !isStringArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function messageStepIssue(step: Record<string, unknown>): string | undefined {
  if (!isOneOf(step['source'], messageSources)) return `unsupported message source: ${String(step['source'])}.`;
  return Object.hasOwn(step, 'message') ? undefined : 'message step requires message.';
}

function inputEventIssue(event: unknown): string | undefined {
  if (!isRecord(event)) return 'input event must be an object.';
  switch (event['kind']) {
    case 'key':
      return keyEventIssue(event);
    case 'text':
      return typeof event['text'] === 'string' && event['paste'] === false
        ? undefined
        : 'text event requires text and paste:false.';
    case 'paste':
      return typeof event['text'] === 'string' && typeof event['bracketed'] === 'boolean'
        ? undefined
        : 'paste event requires text and bracketed.';
    case 'mouse':
      return mouseEventIssue(event);
    case 'resize':
      return terminalSizeIssue(event['terminalSize']);
    case 'focus':
      return typeof event['focused'] === 'boolean' ? undefined : 'focus event requires focused.';
    case 'signal':
      return typeof event['signal'] === 'string' && event['signal'].length > 0
        ? undefined
        : 'signal event requires signal.';
    case 'end':
      return undefined;
    case 'unknown':
      return typeof event['sequence'] === 'string' ? undefined : 'unknown event requires sequence.';
    default:
      return `unsupported input event kind: ${String(event['kind'])}.`;
  }
}

function keyEventIssue(event: Record<string, unknown>): string | undefined {
  if (!isOneOf(event['key'], keyNames)) return `unsupported key name: ${String(event['key'])}.`;
  if (!isRecord(event['modifiers'])) return 'key event requires modifiers.';
  for (const modifier of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (typeof event['modifiers'][modifier] !== 'boolean') return `key modifiers require ${modifier}.`;
  }
  if (event['sequence'] !== undefined && typeof event['sequence'] !== 'string') return 'key sequence must be a string.';
  if (event['keyCodePoint'] !== undefined && !isUnicodeScalar(event['keyCodePoint'])) {
    return 'key code point is invalid.';
  }
  if (event['committedText'] !== undefined && typeof event['committedText'] !== 'string') {
    return 'key committedText must be a string.';
  }
  if (event['alternateCodePoints'] !== undefined) {
    const issue = alternateCodePointsIssue(event['alternateCodePoints']);
    if (issue !== undefined) return issue;
  }
  if (!isOneOf(event['eventType'], ['press', 'repeat', 'release'] as const)) return 'key event requires eventType.';
  if (!isOneOf(event['location'], ['standard', 'numpad', 'unknown'] as const)) return 'key event requires location.';
  return undefined;
}

function alternateCodePointsIssue(value: unknown): string | undefined {
  if (!isRecord(value)) return 'key alternateCodePoints must be an object.';
  const shifted = value['shifted'];
  const baseLayout = value['baseLayout'];
  if (shifted === undefined && baseLayout === undefined) {
    return 'key alternateCodePoints requires shifted or baseLayout.';
  }
  if (shifted !== undefined && !isUnicodeScalar(shifted)) return 'key shifted alternate code point is invalid.';
  if (baseLayout !== undefined && !isUnicodeScalar(baseLayout)) return 'key base-layout alternate code point is invalid.';
  return undefined;
}

function isUnicodeScalar(value: unknown): boolean {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= 0x10ffff
    && !(Number(value) >= 0xd800 && Number(value) <= 0xdfff);
}

function mouseEventIssue(event: Record<string, unknown>): string | undefined {
  if (typeof event['sequence'] !== 'string') return 'mouse event requires sequence.';
  if (!isOneOf(event['encoding'], mouseEncodings)) return `unsupported mouse encoding: ${String(event['encoding'])}.`;
  if (!isOneOf(event['action'], mouseActions)) return `unsupported mouse action: ${String(event['action'])}.`;
  if (!isOneOf(event['button'], mouseButtons)) return `unsupported mouse button: ${String(event['button'])}.`;
  if (!isIntegerAtLeast(event['row'], 1) || !isIntegerAtLeast(event['column'], 1)) {
    return 'mouse event row and column must be positive integers.';
  }
  if (!Number.isInteger(event['rawCode'])) return 'mouse event rawCode must be an integer.';
  if (!isRecord(event['modifiers'])) return 'mouse event requires modifiers.';
  for (const modifier of ['shift', 'alt', 'ctrl'] as const) {
    if (typeof event['modifiers'][modifier] !== 'boolean') return `mouse modifiers require ${modifier}.`;
  }
  return undefined;
}

function frameIssue(frame: unknown): string | undefined {
  if (!isRecord(frame)) return 'frame must be an object.';
  if (frame['schemaVersion'] !== 'terminal-ui.tui-frame.v1') return 'frame schemaVersion is invalid.';
  if (!isIntegerAtLeast(frame['width'], 0) || !isIntegerAtLeast(frame['height'], 0)) {
    return 'frame width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(frame['widthProfile']);
  if (widthProfile !== undefined) return `frame widthProfile: ${widthProfile}`;
  if (!Array.isArray(frame['cells'])) return 'frame cells must be an array.';
  for (const [index, cell] of frame['cells'].entries()) {
    const issue = frameCellIssue(cell);
    if (issue !== undefined) return `frame cell ${String(index)}: ${issue}`;
  }
  if (frame['cursor'] !== undefined) {
    const issue = cursorIssue(frame['cursor']);
    if (issue !== undefined) return issue;
  }
  if (frame['focusPath'] !== undefined && !isStringArray(frame['focusPath'])) {
    return 'frame focusPath must be a string array.';
  }
  const snapshot = snapshotIssue(frame['accessibility']);
  return snapshot === undefined ? undefined : `frame accessibility: ${snapshot}`;
}

function frameCellIssue(cell: unknown): string | undefined {
  if (!isRecord(cell)) return 'cell must be an object.';
  if (!isIntegerAtLeast(cell['row'], 1) || !isIntegerAtLeast(cell['column'], 1)) {
    return 'row and column must be positive integers.';
  }
  if (typeof cell['text'] !== 'string') return 'text must be a string.';
  if (!isIntegerAtLeast(cell['width'], 0)) return 'width must be a non-negative integer.';
  if (cell['continuation'] !== undefined && typeof cell['continuation'] !== 'boolean') {
    return 'continuation must be a boolean.';
  }
  const sourceIssue = frameCellSourceIssue(cell['source']);
  if (sourceIssue !== undefined) return `source: ${sourceIssue}`;
  return undefined;
}

function cursorIssue(cursor: unknown): string | undefined {
  if (!isRecord(cursor)) return 'frame cursor must be an object.';
  const typed = cursor as Partial<CursorPosition>;
  if (!isIntegerAtLeast(typed.row, 1) || !isIntegerAtLeast(typed.column, 1)) {
    return 'frame cursor row and column must be positive integers.';
  }
  const sourceIssue = frameCellSourceIssue(cursor['source']);
  return sourceIssue === undefined ? undefined : `frame cursor source: ${sourceIssue}`;
}

function renderDiffIssue(diff: unknown): string | undefined {
  if (!isRecord(diff)) return 'diff must be an object.';
  if (diff['schemaVersion'] !== 'terminal-ui.render-diff.v2') return 'diff schemaVersion is invalid.';
  if (!isIntegerAtLeast(diff['width'], 0) || !isIntegerAtLeast(diff['height'], 0)) {
    return 'diff width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(diff['widthProfile']);
  if (widthProfile !== undefined) return `diff widthProfile: ${widthProfile}`;
  const normalizedWidthProfile = defineTextWidthProfile(diff['widthProfile']);
  const width = Number(diff['width']);
  const height = Number(diff['height']);
  if (typeof diff['fullRewrite'] !== 'boolean') return 'diff fullRewrite must be a boolean.';
  if (!Array.isArray(diff['operations'])) return 'diff operations must be an array.';
  if (diff['cursor'] !== undefined) {
    const issue = cursorIssue(diff['cursor']);
    if (issue !== undefined) return `diff cursor: ${issue}`;
    if (isRecord(diff['cursor']) && !pointFits(diff['cursor'], width, height)) {
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
    const issue = renderOperationIssue(operation, width, height, normalizedWidthProfile);
    if (issue !== undefined) return `diff operation ${String(index)}: ${issue}`;
  }
  return undefined;
}

function textWidthProfileIssue(value: unknown): string | undefined {
  if (!isRecord(value)) return 'must be an object.';
  if (value['emoji'] !== 'narrow' && value['emoji'] !== 'wide') {
    return 'emoji must be "narrow" or "wide".';
  }
  if (value['ambiguous'] !== 'narrow' && value['ambiguous'] !== 'wide') {
    return 'ambiguous must be "narrow" or "wide".';
  }
  return undefined;
}

function renderOperationIssue(
  operation: unknown,
  width: number,
  height: number,
  widthProfile: TextWidthProfile
): string | undefined {
  if (!isRecord(operation)) return 'operation must be an object.';
  switch (operation['kind']) {
    case 'write': {
      if (!isIntegerAtLeast(operation['row'], 1) || !isIntegerAtLeast(operation['column'], 1)) {
        return 'write requires positive integer row and column.';
      }
      const row = Number(operation['row']);
      const column = Number(operation['column']);
      if (!Array.isArray(operation['spans']) || operation['spans'].length === 0) {
        return 'write requires at least one span.';
      }
      let columns = 0;
      for (const item of operation['spans']) {
        if (!isRecord(item) || typeof item['text'] !== 'string') {
          return 'write spans must contain text.';
        }
        const sourceIssue = frameCellSourceIssue(item['source']);
        if (sourceIssue !== undefined) return `write span source: ${sourceIssue}`;
        columns += measureTextCells(item['text'], { widthProfile }).cells;
      }
      if (columns <= 0) return 'write must affect at least one terminal cell.';
      if (row > height || column + columns - 1 > width) {
        return 'write must fit within the declared frame.';
      }
      return undefined;
    }
    case 'clearRect':
      return boundedRectIssue(operation['bounds'], width, height);
    default:
      return `unsupported diff operation kind: ${String(operation['kind'])}.`;
  }
}

function frameCellSourceIssue(source: unknown): string | undefined {
  if (source === undefined) return undefined;
  if (!isRecord(source)) return 'must be an object.';
  if (source['state'] !== undefined && !isFrameCellInteractionState(source['state'])) {
    return 'state must be focused, hovered, pressed, selected, disabled, or active.';
  }
  return undefined;
}

function rectIssue(rect: unknown): string | undefined {
  if (!isRecord(rect)) return 'clearRect bounds must be an object.';
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
  if (!isRecord(rect)) return 'bounds must be an object.';
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

function snapshotIssue(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot)) return 'snapshot must be an object.';
  const result = validateAccessibleSnapshot(snapshot);
  return result.ok ? undefined : result.error.message;
}

function restoreResultIssue(result: unknown): string | undefined {
  if (!isRecord(result)) return 'restore result must be an object.';
  const typed = result as Partial<TerminalRestoreResult>;
  if (!isOneOf(typed.status, ['restored', 'partial', 'failed'] as const)) return 'restore result requires status.';
  if (!isOneOf(typed.reason, ['success', 'cancelled', 'interrupted', 'timeout', 'error', 'disposed'] as const)) {
    return 'restore result requires reason.';
  }
  const requestedIssue = terminalStateSnapshotIssue(typed.requested);
  if (requestedIssue !== undefined) return `restore requested state: ${requestedIssue}`;
  const resultingIssue = terminalStateSnapshotIssue(typed.resultingState);
  if (resultingIssue !== undefined) return `restore resulting state: ${resultingIssue}`;
  if (!Array.isArray(typed.attempted)) return 'restore result requires attempted.';
  for (const operation of typed.attempted) {
    const issue = terminalStateChangeIssue(operation);
    if (issue !== undefined) return `restore attempted: ${issue}`;
  }
  if (!Array.isArray(typed.confirmed)) return 'restore result requires confirmed.';
  for (const operation of typed.confirmed) {
    const issue = terminalStateChangeIssue(operation);
    if (issue !== undefined) return `restore confirmed: ${issue}`;
  }
  if (!isOrderedTerminalStateChangeSubset(typed.confirmed, typed.attempted)) {
    return 'restore confirmed operations must be an ordered subset of attempted operations.';
  }
  if (!Array.isArray(typed.diagnostics)) return 'restore result requires diagnostics.';
  for (const item of typed.diagnostics) {
    const issue = terminalDiagnosticIssue(item);
    if (issue !== undefined) return `restore diagnostic: ${issue}`;
  }
  return undefined;
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
    const leftProfile = normalizeKeyboardProfile(left.enabled);
    const rightProfile = normalizeKeyboardProfile(right.enabled);
    return leftProfile.kind === rightProfile.kind
      && (leftProfile.kind === 'legacy'
        || (rightProfile.kind === 'kitty' && leftProfile.flags === rightProfile.flags));
  }
  return left.enabled === right.enabled;
}

function terminalStateSnapshotIssue(checkpoint: unknown): string | undefined {
  if (!isRecord(checkpoint)) return 'terminal state must be an object.';
  const typed = checkpoint as Partial<TerminalStateSnapshot>;
  if (typeof typed.rawInput !== 'boolean') return 'terminal state requires rawInput.';
  if (typeof typed.alternateScreen !== 'boolean') return 'terminal state requires alternateScreen.';
  if (typeof typed.bracketedPaste !== 'boolean') return 'terminal state requires bracketedPaste.';
  if (!isOneOf(typed.mouseReporting, ['none', 'click', 'drag', 'all'] as const)) {
    return 'terminal state requires mouseReporting.';
  }
  if (typeof typed.focusReporting !== 'boolean') return 'terminal state requires focusReporting.';
  try {
    normalizeKeyboardProfile(typed.keyboardProfile);
  } catch {
    return 'terminal state requires a valid keyboardProfile.';
  }
  if (typeof typed.cursorVisible !== 'boolean') return 'terminal state requires cursorVisible.';
  if (!isRecord(typed.provenance)) return 'terminal state requires provenance.';
  for (const key of ['rawInput', 'alternateScreen', 'bracketedPaste', 'mouseReporting', 'focusReporting', 'keyboardProfile', 'cursorVisible'] as const) {
    if (!isOneOf(typed.provenance[key], ['observed', 'explicit', 'library_known', 'assumed', 'indeterminate'] as const)) {
      return `terminal state provenance requires ${key}.`;
    }
  }
  return undefined;
}

function terminalStateChangeIssue(operation: unknown): string | undefined {
  if (!isRecord(operation)) return 'terminal state change must be an object.';
  const typed = operation as Partial<TerminalStateChange>;
  switch (typed.kind) {
    case 'rawInput':
    case 'alternateScreen':
    case 'bracketedPaste':
    case 'focusReporting':
    case 'cursorVisible':
      return typeof typed.enabled === 'boolean' ? undefined : `${typed.kind} requires a boolean value.`;
    case 'mouseReporting':
      return isOneOf(typed.enabled, ['none', 'click', 'drag', 'all'] as const)
        ? undefined
        : 'mouseReporting requires a valid mode.';
    case 'keyboardProfile':
      try {
        normalizeKeyboardProfile(typed.enabled);
        return undefined;
      } catch {
        return 'keyboardProfile requires a valid profile.';
      }
    default:
      return 'terminal state change requires a valid kind.';
  }
}

function terminalSizeIssue(terminalSize: unknown): string | undefined {
  if (!isRecord(terminalSize)) return 'terminal size must be an object.';
  const typed = terminalSize as Partial<TerminalSize>;
  return isIntegerAtLeast(typed.columns, 1) && isIntegerAtLeast(typed.rows, 1)
    ? undefined
    : 'terminal size columns and rows must be positive integers.';
}

function transcriptFailure(message: string): Result<never> {
  return err(diagnostic('TRANSCRIPT_REPLAY_FAILED', message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIntegerAtLeast(value: unknown, min: number): boolean {
  return Number.isInteger(value) && Number(value) >= min;
}

function isOneOf<TValue extends string>(value: unknown, options: readonly TValue[]): value is TValue {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}
