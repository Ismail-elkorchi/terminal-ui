import { applyScrollRequest, createScrollState } from './scroll.ts';
import {
  breakEditHistoryGroup,
  createBoundedEditHistory,
  recordEditHistory,
  replaceEditHistoryGroup,
} from '../text/bounded-history.ts';
import {
  editTextDocument,
  applyTextChangeSet,
  createTextChangeSet,
  emptyTextChangeSet,
  editTextBuffer,
  normalizeTextCaret,
  normalizeTextCursor,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelection,
  normalizeTextSelection,
  createTextDocument,
  textCaretAt,
  textDocumentSelectionBetween,
  textDocumentSlice
} from '../text/index.ts';
import {
  applyTextChangePlan,
  createTextChangePlan,
  invertTextChangeSet,
  invertTextChangePlan
} from '../text/change-set.ts';
import type {
  BoundedEditHistory,
  EditHistoryPolicy,
  TextCaret,
  TextChangeSet,
  TextDocument,
  TextDocumentSelection,
  TextEditBuffer,
  TextSelection
} from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextAreaTransition } from './text-area.ts';
import type { TextInputTransition, TextInputState } from './text-input.ts';
import { textDocumentRevision } from '../text/document.ts';

const utf8Encoder = new TextEncoder();

export interface TextAreaState {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll: ScrollState;
  readonly revealCaret: boolean;
  readonly history: TextAreaEditHistory;
}

export interface TextAreaEditPoint {
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
}

export interface TextAreaEditRecord {
  readonly before: TextAreaEditPoint;
  readonly after: TextAreaEditPoint;
  readonly forwardChanges: TextChangeSet;
  readonly inverseChanges: TextChangeSet;
}

export type TextAreaEditHistory = BoundedEditHistory<TextAreaEditRecord, 'insert'>;

const textAreaHistoryRevisions = new WeakMap<object, object>();

export interface TextAreaReduction {
  readonly state: TextAreaState;
  readonly changeSet: TextChangeSet;
  readonly historyRejection?: TextAreaHistoryRejection;
}

export interface TextAreaHistoryRejection {
  readonly reason: 'entry-count-limit' | 'retained-byte-limit';
  readonly entryRetainedBytes: number;
  readonly limit: number;
}

export interface CreateTextAreaStateInput {
  readonly value: string;
  readonly caret?: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll?: ScrollState;
  readonly historyPolicy?: EditHistoryPolicy;
}

export function createTextAreaState(input: CreateTextAreaStateInput): TextAreaState {
  const document = createTextDocument(input.value);
  const caret = normalizeTextCaret(document, input.caret ?? textCaretAt(0));
  const selection = normalizeTextDocumentSelection(document, input.selection);
  return {
    document,
    caret,
    ...(selection === undefined ? {} : { selection }),
    scroll: input.scroll ?? createScrollState(),
    revealCaret: true,
    history: bindTextAreaHistory(createBoundedEditHistory(input.historyPolicy), document)
  };
}

export function textInputState(state: TextEditBuffer): TextInputState {
  const selection = normalizeTextSelection(state.text, state.selection);
  return {
    value: state.text,
    cursor: normalizeTextCursor(state.text, state.cursor),
    ...(selection === undefined ? {} : { selection })
  };
}

export function textInputReducer(state: TextEditBuffer, transition: TextInputTransition): TextEditBuffer {
  return transition.kind === 'edit'
    ? editTextBuffer(state, transition.operation)
    : applyTextPointerTransition(state, transition.transition);
}

export function textAreaReducer(state: TextAreaState, transition: TextAreaTransition): TextAreaReduction {
  assertTextAreaHistoryRevision(state);
  switch (transition.kind) {
    case 'edit': {
      const edited = editTextDocument(state, transition.operation);
      if (edited === state) return unchangedTextAreaReduction(state);
      const textChanged = edited.document !== state.document;
      const changeSet = textChanged
        ? changeSetFromEdit(edited)
        : emptyTextChangeSet;
      const inverseChanges = textChanged
        ? invertTextChangeSet(state.document, changeSet)
        : emptyTextChangeSet;
      const group = transition.operation.kind === 'insert' && state.selection === undefined
        ? 'insert' as const
        : undefined;
      const historyResult = textChanged
        ? recordTextAreaHistory(state, edited, changeSet, inverseChanges, group)
        : undefined;
      const next: TextAreaState = {
        document: edited.document,
        caret: edited.caret,
        ...(edited.selection === undefined ? {} : { selection: edited.selection }),
        scroll: state.scroll,
        revealCaret: true,
        history: historyResult?.history ?? breakEditHistoryGroup(state.history)
      };
      return textAreaReduction(next, changeSet, historyResult?.rejection);
    }
    case 'applyChanges': {
      const changePlan = createTextChangePlan(state.document, transition.changeSet);
      if (changePlan.changes.length === 0) return unchangedTextAreaReduction(state);
      const document = applyTextChangePlan(state.document, changePlan);
      if (document === state.document) return unchangedTextAreaReduction(state);
      const inverseChanges = invertTextChangePlan(state.document, changePlan);
      const requestedCaret = transition.caretOffset ?? caretAfterChanges(changePlan);
      const after = { caret: textCaretAt(normalizeTextDocumentOffset(document, requestedCaret)) };
      const record = textAreaEditRecord(state, after, changePlan, inverseChanges);
      const historyResult = recordTextAreaEdit(state.history, record);
      const next: TextAreaState = {
        document,
        caret: after.caret,
        scroll: state.scroll,
        revealCaret: true,
        history: historyResult.history,
      };
      return textAreaReduction(next, changePlan, historyResult.rejection);
    }
    case 'undo':
      return restoreTextAreaHistory(state, 'undo');
    case 'redo':
      return restoreTextAreaHistory(state, 'redo');
    case 'pointer': {
      const offset = normalizeTextDocumentOffset(state.document, transition.transition.offset);
      const selected = transition.transition.kind === 'placeCaret'
        ? textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
          caret: textCaretAt(offset),
          revealCaret: true
        }, undefined)
        : textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
          caret: textCaretAt(offset),
          revealCaret: true
        }, normalizeTextDocumentSelection(
          state.document,
          textDocumentSelectionBetween(
            normalizeTextDocumentOffset(state.document, transition.transition.anchor),
            offset,
          ),
        ));
      if (transition.scrollRequest === undefined) return textAreaReduction(selected, emptyTextChangeSet);
      return textAreaReduction({
        ...selected,
        scroll: applyScrollRequest(selected.scroll, transition.scrollRequest),
        revealCaret: false,
      }, emptyTextChangeSet);
    }
    case 'scroll': {
      const scroll = applyScrollRequest(state.scroll, transition.request);
      if (scroll === state.scroll && !state.revealCaret) return unchangedTextAreaReduction(state);
      return textAreaReduction({ ...state, scroll, revealCaret: false }, emptyTextChangeSet);
    }
  }
}

function breakTextAreaHistoryGroup(state: TextAreaState): TextAreaState {
  const history = breakEditHistoryGroup(state.history);
  return history === state.history ? state : { ...state, history };
}

function textAreaStateWithSelection(
  state: TextAreaState,
  changes: Partial<Pick<TextAreaState, 'document' | 'caret' | 'scroll' | 'revealCaret'>>,
  selection: TextDocumentSelection | undefined
): TextAreaState {
  const nextDocument = changes.document ?? state.document;
  const nextCaret = changes.caret ?? state.caret;
  const nextScroll = changes.scroll ?? state.scroll;
  const nextRevealCaret = changes.revealCaret ?? state.revealCaret;
  if (
    nextDocument === state.document
    && sameTextCaret(nextCaret, state.caret)
    && nextScroll === state.scroll
    && nextRevealCaret === state.revealCaret
    && sameDocumentSelection(selection, state.selection)
  ) return state;
  const { selection: previousSelection, ...base } = state;
  void previousSelection;
  return {
    ...base,
    ...changes,
    ...(selection === undefined ? {} : { selection })
  };
}

function restoreTextAreaHistory(
  state: TextAreaState,
  direction: 'undo' | 'redo'
): TextAreaReduction {
  const entry = direction === 'undo' ? state.history.undo.at(-1) : state.history.redo.at(-1);
  if (entry === undefined) {
    const history = breakEditHistoryGroup(state.history);
    return unchangedTextAreaReduction(history === state.history ? state : { ...state, history });
  }
  const record = entry.snapshot;
  const changeSet = direction === 'undo' ? record.inverseChanges : record.forwardChanges;
  const document = applyTextChangeSet(state.document, changeSet);
  const point = direction === 'undo' ? record.before : record.after;
  return textAreaReduction({
    document,
    caret: point.caret,
    ...(point.selection === undefined ? {} : { selection: point.selection }),
    scroll: state.scroll,
    revealCaret: true,
    history: moveTextAreaHistoryEntry(state.history, direction),
  }, changeSet);
}

function textAreaEditRecord(
  before: Pick<TextAreaState, 'caret' | 'selection'>,
  after: Pick<TextAreaState, 'caret' | 'selection'>,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): TextAreaEditRecord {
  return Object.freeze({
    before: textAreaEditPoint(before),
    after: textAreaEditPoint(after),
    forwardChanges,
    inverseChanges
  });
}

function textAreaEditPoint(
  state: Pick<TextAreaState, 'caret' | 'selection'>,
): TextAreaEditPoint {
  const caret = Object.freeze({
    position: Object.freeze({ ...state.caret.position }),
    ...(state.caret.preferredColumnCells === undefined
      ? {}
      : { preferredColumnCells: state.caret.preferredColumnCells }),
  });
  const selection = state.selection === undefined
    ? undefined
    : Object.freeze({
        anchor: Object.freeze({ ...state.selection.anchor }),
        focus: Object.freeze({ ...state.selection.focus }),
      });
  return Object.freeze({
    caret,
    ...(selection === undefined ? {} : { selection }),
  });
}

function textAreaEditRecordBytes(
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): number {
  const changeBytes = [...forwardChanges.changes, ...inverseChanges.changes]
    .reduce((total, change) => (
      total + utf8Encoder.encode(change.insertedText).byteLength + 24
    ), 0);
  return changeBytes + 64;
}

function recordTextAreaHistory(
  state: TextAreaState,
  after: Pick<TextAreaState, 'caret' | 'selection'>,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet,
  group: 'insert' | undefined
): TextAreaHistoryRecordResult {
  if (group === 'insert' && state.history.currentGroup === group) {
    const previous = state.history.undo.at(-1)?.snapshot;
    const merged = previous === undefined
      ? undefined
      : mergeInsertionRecord(previous, after, forwardChanges);
    if (merged !== undefined) {
      const retainedBytes = textAreaEditRecordBytes(
        merged.forwardChanges,
        merged.inverseChanges,
      );
      const history = replaceEditHistoryGroup(
        state.history,
        merged,
        retainedBytes,
        group
      );
      return textAreaHistoryRecordResult(history, merged, retainedBytes);
    }
  }
  const record = textAreaEditRecord(state, after, forwardChanges, inverseChanges);
  return recordTextAreaEdit(state.history, record, group);
}

interface TextAreaHistoryRecordResult {
  readonly history: TextAreaEditHistory;
  readonly rejection?: TextAreaHistoryRejection;
}

function recordTextAreaEdit(
  history: TextAreaEditHistory,
  record: TextAreaEditRecord,
  group?: 'insert',
): TextAreaHistoryRecordResult {
  const retainedBytes = textAreaEditRecordBytes(record.forwardChanges, record.inverseChanges);
  return textAreaHistoryRecordResult(
    recordEditHistory(history, record, retainedBytes, group),
    record,
    retainedBytes,
  );
}

function textAreaHistoryRecordResult(
  history: TextAreaEditHistory,
  record: TextAreaEditRecord,
  entryRetainedBytes: number,
): TextAreaHistoryRecordResult {
  if (history.undo.at(-1)?.snapshot === record) return { history };
  const reason = history.policy.maxEntries === 0
    ? 'entry-count-limit' as const
    : 'retained-byte-limit' as const;
  return {
    history,
    rejection: Object.freeze({
      reason,
      entryRetainedBytes,
      limit: reason === 'entry-count-limit'
        ? history.policy.maxEntries
        : history.policy.maxRetainedBytes,
    }),
  };
}

function mergeInsertionRecord(
  record: TextAreaEditRecord,
  after: Pick<TextAreaState, 'caret' | 'selection'>,
  nextChanges: TextChangeSet
): TextAreaEditRecord | undefined {
  const previous = record.forwardChanges.changes[0];
  const next = nextChanges.changes[0];
  if (
    record.forwardChanges.changes.length !== 1
    || nextChanges.changes.length !== 1
    || previous === undefined
    || next === undefined
    || previous.startOffset !== previous.endOffsetExclusive
    || next.startOffset !== next.endOffsetExclusive
    || next.startOffset !== previous.startOffset + previous.insertedText.length
  ) return undefined;
  const insertedText = previous.insertedText + next.insertedText;
  const forwardChanges = createTextChangeSet([{
    startOffset: previous.startOffset,
    endOffsetExclusive: previous.endOffsetExclusive,
    insertedText
  }]);
  const inverse = record.inverseChanges.changes[0];
  if (inverse === undefined || record.inverseChanges.changes.length !== 1) return undefined;
  const inverseChanges = createTextChangeSet([{
    startOffset: inverse.startOffset,
    endOffsetExclusive: inverse.endOffsetExclusive + next.insertedText.length,
    insertedText: inverse.insertedText
  }]);
  return Object.freeze({
    before: record.before,
    after: textAreaEditPoint(after),
    forwardChanges,
    inverseChanges,
  });
}

function moveTextAreaHistoryEntry(
  history: TextAreaEditHistory,
  direction: 'undo' | 'redo',
): TextAreaEditHistory {
  const entry = direction === 'undo' ? history.undo.at(-1) : history.redo.at(-1);
  if (entry === undefined) return breakEditHistoryGroup(history);
  const undo = direction === 'undo'
    ? history.undo.slice(0, -1)
    : [...history.undo, entry];
  const redo = direction === 'undo'
    ? [...history.redo, entry]
    : history.redo.slice(0, -1);
  return Object.freeze({
    policy: history.policy,
    undo: Object.freeze(undo),
    redo: Object.freeze(redo),
    retainedBytes: history.retainedBytes,
  });
}

function changeSetFromEdit(
  edited: import('../text/index.ts').TextDocumentEditResult
): TextChangeSet {
  const range = edited.changedRange;
  if (range === undefined) {
    throw new Error('A changed text document must report its exact changed range.');
  }
  return createTextChangeSet([{
    startOffset: range.startOffset,
    endOffsetExclusive: range.oldEndOffsetExclusive,
    insertedText: textDocumentSlice(
      edited.document,
      range.startOffset,
      range.newEndOffsetExclusive
    )
  }]);
}

function textAreaReduction(
  state: TextAreaState,
  changeSet: TextChangeSet,
  historyRejection?: TextAreaHistoryRejection,
): TextAreaReduction {
  bindTextAreaHistory(state.history, state.document);
  return Object.freeze({
    state,
    changeSet,
    ...(historyRejection === undefined ? {} : { historyRejection }),
  });
}

function bindTextAreaHistory(
  history: TextAreaEditHistory,
  document: TextDocument,
): TextAreaEditHistory {
  textAreaHistoryRevisions.set(history, textDocumentRevision(document));
  return history;
}

function assertTextAreaHistoryRevision(state: TextAreaState): void {
  if (textAreaHistoryRevisions.get(state.history) !== textDocumentRevision(state.document)) {
    throw new TypeError('Text area history does not belong to the current document revision.');
  }
}

function unchangedTextAreaReduction(state: TextAreaState): TextAreaReduction {
  return textAreaReduction(state, emptyTextChangeSet);
}

function caretAfterChanges(changeSet: TextChangeSet): number {
  let delta = 0;
  let caret = 0;
  for (const change of changeSet.changes) {
    caret = change.startOffset + delta + change.insertedText.length;
    delta += change.insertedText.length - (change.endOffsetExclusive - change.startOffset);
  }
  return caret;
}

function sameTextCaret(left: TextCaret, right: TextCaret): boolean {
  return left.position.offset === right.position.offset
    && left.position.affinity === right.position.affinity
    && left.preferredColumnCells === right.preferredColumnCells;
}

function sameDocumentSelection(
  left: TextDocumentSelection | undefined,
  right: TextDocumentSelection | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.anchor.offset === right.anchor.offset
    && left.anchor.affinity === right.anchor.affinity
    && left.focus.offset === right.focus.offset
    && left.focus.affinity === right.focus.affinity;
}

export function applyTextPointerTransition(
  state: TextEditBuffer,
  transition: TextPointerTransition
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, transition.offset);
  if (transition.kind === 'placeCaret') return { text: state.text, cursor: offset };
  const anchor = normalizeTextCursor(state.text, transition.anchor);
  const selection = normalizeTextSelection(state.text, {
    startOffset: anchor,
    endOffsetExclusive: offset
  });
  return {
    text: state.text,
    cursor: offset,
    ...(selection === undefined ? {} : { selection })
  };
}

export function selectionFromTextPointerTransition(
  transition: TextPointerTransition
): TextSelection | undefined {
  if (transition.kind === 'placeCaret') return undefined;
  const start = Math.max(0, Math.floor(Math.min(transition.anchor, transition.offset)));
  const end = Math.max(start, Math.floor(Math.max(transition.anchor, transition.offset)));
  return start === end
    ? undefined
    : { startOffset: start, endOffsetExclusive: end };
}
