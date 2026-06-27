import { validateAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic, terminalDiagnosticIssue } from '../diagnostics.ts';
import { err, ok } from '../result.ts';
import type { TerminalStateSnapshot, TerminalViewport } from '../host/index.ts';
import type { KeyName, MouseAction, MouseButton, MouseEncoding } from '../input/index.ts';
import type { Result } from '../result.ts';
import type { CursorPosition } from '../tui/index.ts';
import type { TuiMessageSource } from '../tui/types.ts';
import type { InteractionTranscript, TranscriptSource } from './types.ts';

const transcriptSources = ['prompt', 'shell', 'tui', 'test', 'replay'] as const satisfies readonly TranscriptSource[];
const messageSources = ['input', 'signal', 'timer', 'external', 'internal'] as const satisfies readonly TuiMessageSource[];
const keyNames = [
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
  'space',
  'ctrlC',
  'ctrlD',
  'unknown'
] as const satisfies readonly KeyName[];
const mouseEncodings = ['sgr', 'x10'] as const satisfies readonly MouseEncoding[];
const mouseActions = ['press', 'release', 'drag', 'move', 'wheel'] as const satisfies readonly MouseAction[];
const mouseButtons = ['left', 'middle', 'right', 'wheelUp', 'wheelDown', 'none', 'unknown'] as const satisfies readonly MouseButton[];

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
  if (transcript['schemaVersion'] !== 'terminal-ui.interaction-transcript.v1') {
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
  for (const [index, item] of transcript['diagnostics'].entries()) {
    const issue = diagnosticIssue(item);
    if (issue !== undefined) return `Invalid transcript diagnostic at index ${String(index)}: ${issue}`;
  }
  for (const [index, item] of transcript['redactions'].entries()) {
    if (!isRecord(item) || typeof item['path'] !== 'string' || typeof item['reason'] !== 'string') {
      return `Invalid transcript redaction at index ${String(index)}.`;
    }
  }

  return undefined;
}

function stepIssue(step: unknown): string | undefined {
  if (!isRecord(step)) return 'step must be an object.';
  switch (step['kind']) {
    case 'input':
      return inputEventIssue(step['event']);
    case 'message':
      return messageStepIssue(step);
    case 'frame':
      return frameIssue(step['frame']);
    case 'diff':
      return renderDiffIssue(step['diff']);
    case 'snapshot':
      return snapshotIssue(step['snapshot']);
    case 'diagnostic':
      return diagnosticIssue(step['diagnostic']);
    case 'restore':
      return restoreCheckpointIssue(step['checkpoint']);
    default:
      return `unsupported step kind: ${String(step['kind'])}.`;
  }
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
      return viewportIssue(event['viewport']);
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
  for (const modifier of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (typeof event[modifier] !== 'boolean') return `key event requires ${modifier}.`;
  }
  if (event['sequence'] !== undefined && typeof event['sequence'] !== 'string') return 'key sequence must be a string.';
  if (event['repeat'] !== undefined && typeof event['repeat'] !== 'boolean') return 'key repeat must be a boolean.';
  return undefined;
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
  return undefined;
}

function cursorIssue(cursor: unknown): string | undefined {
  if (!isRecord(cursor)) return 'frame cursor must be an object.';
  const typed = cursor as Partial<CursorPosition>;
  return isIntegerAtLeast(typed.row, 1) && isIntegerAtLeast(typed.column, 1)
    ? undefined
    : 'frame cursor row and column must be positive integers.';
}

function renderDiffIssue(diff: unknown): string | undefined {
  if (!isRecord(diff)) return 'diff must be an object.';
  if (diff['schemaVersion'] !== 'terminal-ui.render-diff.v1') return 'diff schemaVersion is invalid.';
  if (!isIntegerAtLeast(diff['width'], 0) || !isIntegerAtLeast(diff['height'], 0)) {
    return 'diff width and height must be non-negative integers.';
  }
  if (typeof diff['fullRewrite'] !== 'boolean') return 'diff fullRewrite must be a boolean.';
  if (!Array.isArray(diff['operations'])) return 'diff operations must be an array.';
  for (const [index, operation] of diff['operations'].entries()) {
    const issue = renderOperationIssue(operation);
    if (issue !== undefined) return `diff operation ${String(index)}: ${issue}`;
  }
  return undefined;
}

function renderOperationIssue(operation: unknown): string | undefined {
  if (!isRecord(operation)) return 'operation must be an object.';
  switch (operation['kind']) {
    case 'write':
      return isIntegerAtLeast(operation['row'], 1)
        && isIntegerAtLeast(operation['column'], 1)
        && Array.isArray(operation['spans'])
        && operation['spans'].every((item) => isRecord(item) && typeof item['text'] === 'string')
        ? undefined
        : 'write requires row, column, and spans.';
    case 'clearRect':
      return rectIssue(operation['bounds']) ?? undefined;
    case 'clearLine':
      if (!isIntegerAtLeast(operation['row'], 1)) return 'clearLine requires row.';
      return operation['fromColumn'] === undefined || isIntegerAtLeast(operation['fromColumn'], 1)
        ? undefined
        : 'clearLine fromColumn must be a positive integer.';
    case 'moveCursor':
      return isIntegerAtLeast(operation['row'], 1) && isIntegerAtLeast(operation['column'], 1)
        ? undefined
        : 'moveCursor requires row and column.';
    case 'showCursor':
      return typeof operation['visible'] === 'boolean' ? undefined : 'showCursor requires visible.';
    default:
      return `unsupported diff operation kind: ${String(operation['kind'])}.`;
  }
}

function rectIssue(rect: unknown): string | undefined {
  if (!isRecord(rect)) return 'clearRect bounds must be an object.';
  return isIntegerAtLeast(rect['row'], 1)
    && isIntegerAtLeast(rect['column'], 1)
    && isIntegerAtLeast(rect['width'], 0)
    && isIntegerAtLeast(rect['height'], 0)
    ? undefined
    : 'clearRect bounds must contain row, column, width, and height.';
}

function snapshotIssue(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot)) return 'snapshot must be an object.';
  const result = validateAccessibleSnapshot(snapshot);
  return result.ok ? undefined : result.error.message;
}

function diagnosticIssue(item: unknown): string | undefined {
  return terminalDiagnosticIssue(item);
}

function restoreCheckpointIssue(checkpoint: unknown): string | undefined {
  if (!isRecord(checkpoint)) return 'restore checkpoint must be an object.';
  const typed = checkpoint as Partial<TerminalStateSnapshot>;
  if (typeof typed.rawInput !== 'boolean') return 'restore checkpoint requires rawInput.';
  if (typeof typed.alternateScreen !== 'boolean') return 'restore checkpoint requires alternateScreen.';
  if (typeof typed.bracketedPaste !== 'boolean') return 'restore checkpoint requires bracketedPaste.';
  if (!isOneOf(typed.mouseReporting, ['none', 'click', 'drag', 'all'] as const)) {
    return 'restore checkpoint requires mouseReporting.';
  }
  if (typeof typed.focusReporting !== 'boolean') return 'restore checkpoint requires focusReporting.';
  if (typeof typed.cursorVisible !== 'boolean') return 'restore checkpoint requires cursorVisible.';
  return undefined;
}

function viewportIssue(viewport: unknown): string | undefined {
  if (!isRecord(viewport)) return 'viewport must be an object.';
  const typed = viewport as Partial<TerminalViewport>;
  return isIntegerAtLeast(typed.columns, 1) && isIntegerAtLeast(typed.rows, 1)
    ? undefined
    : 'viewport columns and rows must be positive integers.';
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
