import { validateAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic, diagnosticOccurrenceIssue, terminalDiagnosticIssue } from '../diagnostics.ts';
import { snapshotJsonValue } from '../foundation/json.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isNonEmptyString,
  isStringMember
} from '../foundation/validation.ts';
import { tuiMessageSources } from '../interaction/message.ts';
import { err, ok } from '../result.ts';
import { defineTextWidthProfile, measureTextCells } from '../text/index.ts';
import { isFrameCellInteractionState, isFrameCellRole } from '../visual/source.ts';
import {
  applyRenderDiff,
  renderDiffProjectionMatchesFrame
} from '../renderer/internal/diff-interpreter.ts';
import type { TerminalRestoreResult, TerminalStateChange, TerminalStateSnapshot, TerminalSize } from '../host/index.ts';
import { normalizeKeyboardProfile } from '../protocol/index.ts';
import {
  keyEventTypes,
  keyLocations,
  keyNames,
  mouseActions,
  mouseButtons,
  mouseEncodings,
  mousePointerButtons,
  mouseWheelButtons
} from '../input/types.ts';
import { pointerEventKinds } from '../input/pointer.ts';
import type { Result } from '../result.ts';
import type { CursorPosition, Frame, RenderDiff } from '../renderer/index.ts';
import type { RenderDiffProjection } from '../renderer/internal/diff-interpreter.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { normalizeTerminalStyle } from '../visual/terminal-style.ts';
import { interactionTranscriptFormatVersion, transcriptSources } from './types.ts';
import type { InteractionTranscript } from './types.ts';

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
const transcriptFrameFields = new Set([
  'width',
  'height',
  'widthProfile',
  'cells',
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
  'diagnostics',
  'redactions'
]);
const transcriptStepFields: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  input: new Set(['kind', 'event']),
  message: new Set(['kind', 'source', 'message']),
  commit: new Set(['kind', 'commit']),
  snapshot: new Set(['kind', 'snapshot']),
  diagnostic: new Set(['kind', 'occurrence']),
  restore: new Set(['kind', 'result'])
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
const keyEventFields = new Set([
  'kind',
  'key',
  'keyCodePoint',
  'sequence',
  'modifiers',
  'eventType',
  'location',
  'alternateCodePoints',
  'committedText'
]);
const keyModifierFields = new Set(['ctrl', 'alt', 'shift', 'meta']);
const alternateCodePointFields = new Set(['shifted', 'baseLayout']);
const textEventFields = new Set(['kind', 'text', 'paste']);
const pasteEventFields = new Set(['kind', 'text', 'bracketed']);
const resizeEventFields = new Set(['kind', 'terminalSize']);
const focusEventFields = new Set(['kind', 'focused']);
const signalEventFields = new Set(['kind', 'signal']);
const endEventFields = new Set(['kind']);
const unknownEventFields = new Set(['kind', 'sequence']);
const mouseEventFields = new Set([
  'kind',
  'sequence',
  'encoding',
  'action',
  'button',
  'row',
  'column',
  'rawCode',
  'modifiers'
]);
const mouseWheelEventFields = new Set([
  ...mouseEventFields,
  'deltaRows',
  'deltaColumns'
]);
const mouseModifierFields = new Set(['shift', 'alt', 'ctrl']);
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
  'operations',
  'cursor',
  'fullRewrite',
  'dirtyRegions'
]);
const textWidthProfileFields = new Set(['emoji', 'ambiguous']);
const writeOperationFields = new Set(['kind', 'row', 'column', 'spans']);
const clearRectOperationFields = new Set(['kind', 'bounds']);
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
  'confirmed',
  'resultingState',
  'diagnostics'
]);
const terminalStateFields = new Set([
  'rawInput',
  'alternateScreen',
  'bracketedPaste',
  'mouseReporting',
  'focusReporting',
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
  'keyboardProfile',
  'cursorVisible'
]);
const terminalStateChangeFields = new Set(['kind', 'enabled']);
const legacyKeyboardProfileFields = new Set(['kind']);
const kittyKeyboardProfileFields = new Set(['kind', 'flags']);

export function validateTranscript(transcript: unknown): Result<InteractionTranscript> {
  let decoded: unknown;
  try {
    decoded = snapshotJsonValue(transcript, 'Interaction transcript');
  } catch (cause) {
    return transcriptFailure(errorMessage(cause));
  }
  const issue = transcriptIssue(decoded);
  if (issue !== undefined) return transcriptFailure(issue);
  return ok(decoded as InteractionTranscript);
}

function transcriptIssue(transcript: unknown): string | undefined {
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
  if (!isStringMember(transcript['source'], transcriptSources)) {
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
  const occurrenceIssue = transcriptDiagnosticOccurrenceIssue(
    transcript['steps'],
    transcript['diagnostics']
  );
  if (occurrenceIssue !== undefined) return occurrenceIssue;
  for (const [index, item] of transcript['redactions'].entries()) {
    if (!isNonArrayObject(item) || typeof item['path'] !== 'string' || item['reason'] !== 'secret') {
      return `Invalid transcript redaction at index ${String(index)}.`;
    }
    const unknownField = findUnsupportedField(item, redactionFields);
    if (unknownField !== undefined) {
      return `Invalid transcript redaction at index ${String(index)}: unsupported field ${unknownField}.`;
    }
  }

  return undefined;
}

function transcriptDiagnosticOccurrenceIssue(
  steps: readonly unknown[],
  diagnostics: readonly unknown[]
): string | undefined {
  const stepOccurrences = new Map<string, string>();
  for (const step of steps) {
    if (!isNonArrayObject(step) || step['kind'] !== 'diagnostic') continue;
    const identity = diagnosticOccurrenceIdentity(step['occurrence']);
    if (identity === undefined) continue;
    if (stepOccurrences.has(identity.id)) {
      return `Transcript diagnostic occurrence id ${identity.id} is duplicated in steps.`;
    }
    stepOccurrences.set(identity.id, identity.fingerprint);
  }

  const topLevelOccurrences = new Set<string>();
  for (const occurrence of diagnostics) {
    const identity = diagnosticOccurrenceIdentity(occurrence);
    if (identity === undefined) continue;
    if (topLevelOccurrences.has(identity.id)) {
      return `Transcript diagnostic occurrence id ${identity.id} is duplicated in top-level diagnostics.`;
    }
    topLevelOccurrences.add(identity.id);
    const stepFingerprint = stepOccurrences.get(identity.id);
    if (stepFingerprint !== undefined && stepFingerprint !== identity.fingerprint) {
      return `Transcript diagnostic occurrence id ${identity.id} has conflicting content between steps and top-level diagnostics.`;
    }
  }
  return undefined;
}

function diagnosticOccurrenceIdentity(
  occurrence: unknown
): { readonly id: string; readonly fingerprint: string } | undefined {
  if (!isNonArrayObject(occurrence) || typeof occurrence['id'] !== 'string') return undefined;
  const item = occurrence['diagnostic'];
  if (!isNonArrayObject(item) || typeof item['fingerprint'] !== 'string') return undefined;
  return { id: occurrence['id'], fingerprint: item['fingerprint'] };
}

function transcriptOrderingIssue(steps: readonly unknown[]): string | undefined {
  const commitIds = new Set<string>();
  let lastStateVersion = -1;
  let restorationSeen = false;
  let previousProjection: RenderDiffProjection | undefined;
  for (const [index, step] of steps.entries()) {
    if (!isNonArrayObject(step)) continue;
    if (step['kind'] === 'restore') {
      restorationSeen = true;
      continue;
    }
    if (step['kind'] !== 'commit' || !isNonArrayObject(step['commit'])) continue;
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
    if (!isNonArrayObject(frame) || !isNonArrayObject(diff)) continue;
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
    case 'input':
      return inputEventIssue(step['event']);
    case 'message':
      return messageStepIssue(step);
    case 'commit':
      return commitIssue(step['commit']);
    case 'snapshot':
      return snapshotIssue(step['snapshot']);
    case 'diagnostic':
      return diagnosticOccurrenceIssue(step['occurrence']);
    case 'restore':
      return restoreResultIssue(step['result']);
    default:
      return `unsupported step kind: ${String(step['kind'])}.`;
  }
}

function commitIssue(value: unknown): string | undefined {
  if (!isNonArrayObject(value)) return 'commit must be an object.';
  const unknownField = findUnsupportedField(value, commitFields);
  if (unknownField !== undefined) return `commit contains unsupported field: ${unknownField}.`;
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
  return undefined;
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
  return Object.hasOwn(step, 'message') ? undefined : 'message step requires message.';
}

function inputEventIssue(event: unknown): string | undefined {
  if (!isNonArrayObject(event)) return 'input event must be an object.';
  switch (event['kind']) {
    case 'key': {
      const fieldIssue = eventFieldsIssue(event, keyEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return keyEventIssue(event);
    }
    case 'text': {
      const fieldIssue = eventFieldsIssue(event, textEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return typeof event['text'] === 'string' && event['paste'] === false
        ? undefined
        : 'text event requires text and paste:false.';
    }
    case 'paste': {
      const fieldIssue = eventFieldsIssue(event, pasteEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return typeof event['text'] === 'string' && typeof event['bracketed'] === 'boolean'
        ? undefined
        : 'paste event requires text and bracketed.';
    }
    case 'mouse': {
      const fieldIssue = eventFieldsIssue(
        event,
        event['action'] === 'wheel' ? mouseWheelEventFields : mouseEventFields
      );
      if (fieldIssue !== undefined) return fieldIssue;
      return mouseEventIssue(event);
    }
    case 'resize': {
      const fieldIssue = eventFieldsIssue(event, resizeEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return terminalSizeIssue(event['terminalSize']);
    }
    case 'focus': {
      const fieldIssue = eventFieldsIssue(event, focusEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return typeof event['focused'] === 'boolean' ? undefined : 'focus event requires focused.';
    }
    case 'signal': {
      const fieldIssue = eventFieldsIssue(event, signalEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return typeof event['signal'] === 'string' && event['signal'].length > 0
        ? undefined
        : 'signal event requires signal.';
    }
    case 'end': {
      const fieldIssue = eventFieldsIssue(event, endEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return undefined;
    }
    case 'unknown': {
      const fieldIssue = eventFieldsIssue(event, unknownEventFields);
      if (fieldIssue !== undefined) return fieldIssue;
      return typeof event['sequence'] === 'string' ? undefined : 'unknown event requires sequence.';
    }
    default:
      return `unsupported input event kind: ${String(event['kind'])}.`;
  }
}

function keyEventIssue(event: Record<string, unknown>): string | undefined {
  if (!isStringMember(event['key'], keyNames)) return `unsupported key name: ${String(event['key'])}.`;
  if (!isNonArrayObject(event['modifiers'])) return 'key event requires modifiers.';
  const modifierField = findUnsupportedField(event['modifiers'], keyModifierFields);
  if (modifierField !== undefined) return `key modifiers contain unsupported field: ${modifierField}.`;
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
  if (!isStringMember(event['eventType'], keyEventTypes)) return 'key event requires eventType.';
  if (!isStringMember(event['location'], keyLocations)) return 'key event requires location.';
  return undefined;
}

function alternateCodePointsIssue(value: unknown): string | undefined {
  if (!isNonArrayObject(value)) return 'key alternateCodePoints must be an object.';
  const unknownField = findUnsupportedField(value, alternateCodePointFields);
  if (unknownField !== undefined) {
    return `key alternateCodePoints contains unsupported field: ${unknownField}.`;
  }
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
  if (!isStringMember(event['encoding'], mouseEncodings)) return `unsupported mouse encoding: ${String(event['encoding'])}.`;
  if (!isStringMember(event['action'], mouseActions)) return `unsupported mouse action: ${String(event['action'])}.`;
  if (!isStringMember(event['button'], mouseButtons)) return `unsupported mouse button: ${String(event['button'])}.`;
  if (!isIntegerAtLeast(event['row'], 1) || !isIntegerAtLeast(event['column'], 1)) {
    return 'mouse event row and column must be positive integers.';
  }
  if (!Number.isInteger(event['rawCode'])) return 'mouse event rawCode must be an integer.';
  if (!isNonArrayObject(event['modifiers'])) return 'mouse event requires modifiers.';
  const modifierField = findUnsupportedField(event['modifiers'], mouseModifierFields);
  if (modifierField !== undefined) return `mouse modifiers contain unsupported field: ${modifierField}.`;
  for (const modifier of ['shift', 'alt', 'ctrl'] as const) {
    if (typeof event['modifiers'][modifier] !== 'boolean') return `mouse modifiers require ${modifier}.`;
  }
  if (event['action'] === 'wheel') {
    if (!isStringMember(event['button'], mouseWheelButtons)) {
      return 'wheel event requires a wheel-compatible button.';
    }
    if (!isFiniteNumber(event['deltaRows']) || !isFiniteNumber(event['deltaColumns'])) {
      return 'wheel event requires finite deltaRows and deltaColumns.';
    }
  } else if (!isStringMember(event['button'], mousePointerButtons)) {
    return 'pointer event requires a pointer-compatible button.';
  }
  return undefined;
}

function frameIssue(frame: unknown): string | undefined {
  if (!isNonArrayObject(frame)) return 'frame must be an object.';
  const unknownField = findUnsupportedField(frame, transcriptFrameFields);
  if (unknownField !== undefined) return `frame contains unsupported field: ${unknownField}.`;
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
  if (frame['hitTargets'] !== undefined) {
    if (!Array.isArray(frame['hitTargets'])) return 'frame hitTargets must be an array.';
    for (const [index, target] of frame['hitTargets'].entries()) {
      const issue = frameHitTargetIssue(target, Number(frame['width']), Number(frame['height']));
      if (issue !== undefined) return `frame hit target ${String(index)}: ${issue}`;
    }
  }
  if (frame['focusPath'] !== undefined && !isStringArray(frame['focusPath'])) {
    return 'frame focusPath must be a string array.';
  }
  const snapshot = snapshotIssue(frame['accessibility']);
  return snapshot === undefined ? undefined : `frame accessibility: ${snapshot}`;
}

function frameCellIssue(cell: unknown): string | undefined {
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
  const style = terminalStyleIssue(cell['style'], 'cell style');
  if (style !== undefined) return style;
  const link = terminalLinkIssue(cell['link']);
  if (link !== undefined) return `link: ${link}`;
  const sourceIssue = frameCellSourceIssue(cell['source']);
  if (sourceIssue !== undefined) return `source: ${sourceIssue}`;
  return undefined;
}

function cursorIssue(cursor: unknown): string | undefined {
  if (!isNonArrayObject(cursor)) return 'frame cursor must be an object.';
  const unknownField = findUnsupportedField(cursor, cursorFields);
  if (unknownField !== undefined) return `cursor contains unsupported field: ${unknownField}.`;
  const typed = cursor as Partial<CursorPosition>;
  if (!isIntegerAtLeast(typed.row, 1) || !isIntegerAtLeast(typed.column, 1)) {
    return 'frame cursor row and column must be positive integers.';
  }
  const style = terminalStyleIssue(cursor['style'], 'cursor style');
  if (style !== undefined) return style;
  const sourceIssue = frameCellSourceIssue(cursor['source']);
  return sourceIssue === undefined ? undefined : `frame cursor source: ${sourceIssue}`;
}

function renderDiffIssue(diff: unknown): string | undefined {
  if (!isNonArrayObject(diff)) return 'diff must be an object.';
  const unknownField = findUnsupportedField(diff, renderDiffFields);
  if (unknownField !== undefined) return `diff contains unsupported field: ${unknownField}.`;
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
    const issue = renderOperationIssue(operation, width, height, normalizedWidthProfile);
    if (issue !== undefined) return `diff operation ${String(index)}: ${issue}`;
  }
  return undefined;
}

function textWidthProfileIssue(value: unknown): string | undefined {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknownField = findUnsupportedField(value, textWidthProfileFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
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
      for (const item of operation['spans']) {
        if (!isNonArrayObject(item) || typeof item['text'] !== 'string') {
          return 'write spans must contain text.';
        }
        const unknownField = findUnsupportedField(item, renderSpanFields);
        if (unknownField !== undefined) {
          return `write span contains unsupported field: ${unknownField}.`;
        }
        const style = terminalStyleIssue(item['style'], 'write span style');
        if (style !== undefined) return style;
        const link = terminalLinkIssue(item['link']);
        if (link !== undefined) return `write span link: ${link}`;
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
    case 'clearRect': {
      const unknownField = findUnsupportedField(operation, clearRectOperationFields);
      if (unknownField !== undefined) {
        return `clearRect contains unsupported field: ${unknownField}.`;
      }
      return boundedRectIssue(operation['bounds'], width, height);
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

function terminalStyleIssue(style: unknown, subject: string): string | undefined {
  if (style === undefined) return undefined;
  try {
    normalizeTerminalStyle(style, subject);
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

function snapshotIssue(snapshot: unknown): string | undefined {
  if (!isNonArrayObject(snapshot)) return 'snapshot must be an object.';
  const result = validateAccessibleSnapshot(snapshot);
  return result.ok ? undefined : result.error.message;
}

function restoreResultIssue(result: unknown): string | undefined {
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
  if (!isNonArrayObject(checkpoint)) return 'terminal state must be an object.';
  const unknownField = findUnsupportedField(checkpoint, terminalStateFields);
  if (unknownField !== undefined) return `terminal state contains unsupported field: ${unknownField}.`;
  const typed = checkpoint as Partial<TerminalStateSnapshot>;
  if (typeof typed.rawInput !== 'boolean') return 'terminal state requires rawInput.';
  if (typeof typed.alternateScreen !== 'boolean') return 'terminal state requires alternateScreen.';
  if (typeof typed.bracketedPaste !== 'boolean') return 'terminal state requires bracketedPaste.';
  if (!isStringMember(typed.mouseReporting, ['none', 'click', 'drag', 'all'] as const)) {
    return 'terminal state requires mouseReporting.';
  }
  if (typeof typed.focusReporting !== 'boolean') return 'terminal state requires focusReporting.';
  const keyboardProfileIssue = terminalKeyboardProfileIssue(typed.keyboardProfile);
  if (keyboardProfileIssue !== undefined) return `terminal state keyboardProfile: ${keyboardProfileIssue}`;
  if (typeof typed.cursorVisible !== 'boolean') return 'terminal state requires cursorVisible.';
  if (!isNonArrayObject(typed.provenance)) return 'terminal state requires provenance.';
  const provenanceField = findUnsupportedField(typed.provenance, terminalStateProvenanceFields);
  if (provenanceField !== undefined) {
    return `terminal state provenance contains unsupported field: ${provenanceField}.`;
  }
  for (const key of ['rawInput', 'alternateScreen', 'bracketedPaste', 'mouseReporting', 'focusReporting', 'keyboardProfile', 'cursorVisible'] as const) {
    if (!isStringMember(typed.provenance[key], ['observed', 'explicit', 'library_known', 'assumed', 'indeterminate'] as const)) {
      return `terminal state provenance requires ${key}.`;
    }
  }
  return undefined;
}

function terminalStateChangeIssue(operation: unknown): string | undefined {
  if (!isNonArrayObject(operation)) return 'terminal state change must be an object.';
  const unknownField = findUnsupportedField(operation, terminalStateChangeFields);
  if (unknownField !== undefined) {
    return `terminal state change contains unsupported field: ${unknownField}.`;
  }
  const typed = operation as Partial<TerminalStateChange>;
  switch (typed.kind) {
    case 'rawInput':
    case 'alternateScreen':
    case 'bracketedPaste':
    case 'focusReporting':
    case 'cursorVisible':
      return typeof typed.enabled === 'boolean' ? undefined : `${typed.kind} requires a boolean value.`;
    case 'mouseReporting':
      return isStringMember(typed.enabled, ['none', 'click', 'drag', 'all'] as const)
        ? undefined
        : 'mouseReporting requires a valid mode.';
    case 'keyboardProfile':
      return terminalKeyboardProfileIssue(typed.enabled);
    default:
      return 'terminal state change requires a valid kind.';
  }
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

function terminalKeyboardProfileIssue(profile: unknown): string | undefined {
  if (!isNonArrayObject(profile)) return 'keyboardProfile must be an object.';
  const allowedFields = profile['kind'] === 'kitty'
    ? kittyKeyboardProfileFields
    : legacyKeyboardProfileFields;
  const unknownField = findUnsupportedField(profile, allowedFields);
  if (unknownField !== undefined) {
    return `keyboardProfile contains unsupported field: ${unknownField}.`;
  }
  try {
    normalizeKeyboardProfile(profile);
    return undefined;
  } catch {
    return 'keyboardProfile must be a valid legacy or Kitty profile.';
  }
}

function transcriptFailure(message: string): Result<never> {
  return err(diagnostic('TRANSCRIPT_REPLAY_FAILED', message));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIntegerAtLeast(value: unknown, min: number): boolean {
  return Number.isInteger(value) && Number(value) >= min;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function eventFieldsIssue(
  event: Record<string, unknown>,
  fields: ReadonlySet<string>
): string | undefined {
  const unknownField = findUnsupportedField(event, fields);
  return unknownField === undefined
    ? undefined
    : `input event contains unsupported field: ${unknownField}.`;
}
