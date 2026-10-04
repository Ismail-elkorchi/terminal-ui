import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { BoundedEditHistory, EditHistoryPolicy } from '../text/bounded-history.ts';
import {
  breakEditHistoryGroupWork,
  createBoundedEditHistory,
  recordEditHistoryWork,
  replaceEditHistoryGroupWork,
} from '../text/bounded-history.ts';
import {
  applyTextChangePlanWork,
  applyTextChangeSetWork,
  createTextChangePlanWork,
  createTextChangeSet,
  emptyTextChangeSet,
  invertTextChangePlanWork,
  invertTextChangeSetWork,
} from '../text/change-set.ts';
import { sameDocumentSelection, sameTextCaret } from '../text/comparison.ts';
import { textCaretAt } from '../text/coordinates.ts';
import { editTextDocumentWork, textDocumentEditCaretWork } from '../text/document-edit.ts';
import type { TextDocument } from '../text/document.ts';
import {
  createTextDocumentWork,
  normalizeTextCaretWork,
  normalizeTextDocumentOffsetWork,
  normalizeTextDocumentSelectionWork,
  textDocumentRevision,
  textDocumentSliceWork,
} from '../text/document.ts';
import { editSourceTextBuffer } from '../text/edit.ts';
import { normalizeTextCursor, normalizeTextSelection } from '../text/text-range.ts';
import type {
  TextCaret,
  TextChangeSet,
  TextDocumentSelection,
  TextEditBuffer,
  TextSelection,
} from '../text/types.ts';
import { applyScrollRequest, createScrollState } from './scroll.ts';
import type { TextAreaTransition } from './text-area.ts';
import type { TextInputTransition } from './text-input.ts';

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
  readonly value?: string;
  /** Adopt an immutable prepared document without rebuilding its source. */
  readonly document?: TextDocument;
  readonly caret?: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll?: ScrollState;
  readonly historyPolicy?: EditHistoryPolicy;
}

export function createTextAreaState(input: CreateTextAreaStateInput): TextAreaState {
  return finishWork(createTextAreaStateWork(input));
}

export function prepareTextAreaState(input: CreateTextAreaStateInput, context: CooperativeWorkContext): Promise<TextAreaState> {
  return prepareWork(createTextAreaStateWork(input), context);
}

function* createTextAreaStateWork(input: CreateTextAreaStateInput): Generator<number, TextAreaState> {
  if ((input.value === undefined) === (input.document === undefined)) throw new TypeError('Text area state requires exactly one value or document.');
  let document = input.document;
  if (document === undefined) {
    if (input.value === undefined) throw new TypeError('Text area state requires a source.');
    document = yield* createTextDocumentWork(input.value);
  }
  const caret = yield* normalizeTextCaretWork(document, input.caret ?? textCaretAt(0));
  const selection = yield* normalizeTextDocumentSelectionWork(document, input.selection);
  return {
    document,
    caret,
    ...(selection === undefined ? {} : { selection }),
    scroll: input.scroll ?? createScrollState(),
    revealCaret: true,
    history: bindTextAreaHistory(createBoundedEditHistory(input.historyPolicy), document)
  };
}

export function textInputReducer(state: TextEditBuffer, transition: TextInputTransition): TextEditBuffer {
  return transition.kind === 'edit'
    ? editSourceTextBuffer(state, transition.operation)
    : applyTextPointerTransition(state, transition.transition);
}

export function textAreaReducer(state: TextAreaState, transition: TextAreaTransition): TextAreaReduction {
  return finishWork(textAreaReductionWork(state, transition));
}

/** Computes the complete atomic edit, inverse, history and navigation transition. */
export function prepareTextAreaReduction(
  state: TextAreaState, transition: TextAreaTransition, context: CooperativeWorkContext,
): Promise<TextAreaReduction> {
  return prepareWork(textAreaReductionWork(state, transition), context);
}

export function* textAreaReductionWork(state: TextAreaState, transition: TextAreaTransition): Generator<number, TextAreaReduction> {
  assertTextAreaHistoryRevision(state);
  switch (transition.kind) {
    case 'unavailable': return unchangedTextAreaReduction(state);
    case 'edit': {
      const edited = yield* editTextDocumentWork(state, transition.operation);
      if (edited === state) return unchangedTextAreaReduction(state);
      const textChanged = edited.document !== state.document;
      const changeSet = textChanged
        ? yield* changeSetFromEditWork(edited)
        : emptyTextChangeSet;
      const inverseChanges = textChanged
        ? yield* invertTextChangeSetWork(state.document, changeSet)
        : emptyTextChangeSet;
      const group = transition.operation.kind === 'insert' && state.selection === undefined
        ? 'insert' as const
        : undefined;
      const historyResult = textChanged
        ? yield* recordTextAreaHistoryWork(state, edited, changeSet, inverseChanges, group)
        : undefined;
      const next: TextAreaState = {
        document: edited.document,
        caret: edited.caret,
        ...(edited.selection === undefined ? {} : { selection: edited.selection }),
        scroll: state.scroll,
        revealCaret: true,
        history: historyResult?.history ?? (yield* breakEditHistoryGroupWork(state.history))
      };
      return textAreaReduction(next, changeSet, historyResult?.rejection);
    }
    case 'applyChanges': {
      const changePlan = yield* createTextChangePlanWork(state.document, transition.changeSet);
      if (changePlan.changes.length === 0) return unchangedTextAreaReduction(state);
      const document = yield* applyTextChangePlanWork(state.document, changePlan);
      if (document === state.document) return unchangedTextAreaReduction(state);
      const inverseChanges = yield* invertTextChangePlanWork(state.document, changePlan);
      const requestedCaret = transition.caretOffset ?? (yield* caretAfterChangesWork(changePlan));
      const affinity = changesCaretAffinity(changePlan, transition.caretOffset, state.caret);
      const after = { caret: transition.caretOffset === undefined
        ? yield* textDocumentEditCaretWork(document, requestedCaret, affinity)
        : textCaretAt(yield* normalizeTextDocumentOffsetWork(document, requestedCaret), { affinity }) };
      const record = textAreaEditRecord(state, after, changePlan, inverseChanges);
      const historyResult = yield* recordTextAreaEditWork(state.history, record);
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
      return yield* restoreTextAreaHistoryWork(state, 'undo');
    case 'redo':
      return yield* restoreTextAreaHistoryWork(state, 'redo');
    case 'pointer': {
      const offset = yield* normalizeTextDocumentOffsetWork(state.document, transition.transition.offset);
      const selected = transition.transition.kind === 'placeCaret'
        ? textAreaStateWithSelection(yield* breakTextAreaHistoryGroupWork(state), {
          caret: textCaretAt(offset, transition.transition.affinity === undefined ? {} : { affinity: transition.transition.affinity }),
          revealCaret: true
        }, undefined)
        : textAreaStateWithSelection(yield* breakTextAreaHistoryGroupWork(state), {
          caret: textCaretAt(offset, transition.transition.affinity === undefined ? {} : { affinity: transition.transition.affinity }),
          revealCaret: true
        }, yield* normalizeTextDocumentSelectionWork(
          state.document,
          { anchor: { offset: yield* normalizeTextDocumentOffsetWork(state.document, transition.transition.anchor), affinity: transition.transition.anchorAffinity ?? 'downstream' }, focus: { offset, affinity: transition.transition.affinity ?? 'downstream' } },
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

function* breakTextAreaHistoryGroupWork(state: TextAreaState): Generator<number, TextAreaState> {
  const history = yield* breakEditHistoryGroupWork(state.history);
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

function* restoreTextAreaHistoryWork(
  state: TextAreaState,
  direction: 'undo' | 'redo'
): Generator<number, TextAreaReduction> {
  const entry = direction === 'undo' ? state.history.undo.at(-1) : state.history.redo.at(-1);
  if (entry === undefined) {
    const history = yield* breakEditHistoryGroupWork(state.history);
    return unchangedTextAreaReduction(history === state.history ? state : { ...state, history });
  }
  const record = entry.snapshot;
  const changeSet = direction === 'undo' ? record.inverseChanges : record.forwardChanges;
  const document = yield* applyTextChangeSetWork(state.document, changeSet);
  const point = direction === 'undo' ? record.before : record.after;
  return textAreaReduction({
    document,
    caret: point.caret,
    ...(point.selection === undefined ? {} : { selection: point.selection }),
    scroll: state.scroll,
    revealCaret: true,
    history: yield* moveTextAreaHistoryEntryWork(state.history, direction),
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

function* textAreaEditRecordBytesWork(
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): Generator<number, number> {
  let changeBytes = 64;
  for (const changes of [forwardChanges.changes, inverseChanges.changes]) {
    for (const change of changes) {
      changeBytes += 24;
      const text = change.insertedText;
      for (let start = 0; start < text.length;) {
        let end = Math.min(text.length, start + 2048);
        const code = text.charCodeAt(end - 1);
        if (end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
        changeBytes += utf8Encoder.encode(text.slice(start, end)).byteLength;
        yield end - start;
        start = end;
      }
      yield 1;
    }
  }
  return changeBytes;
}

function* recordTextAreaHistoryWork(
  state: TextAreaState,
  after: Pick<TextAreaState, 'caret' | 'selection'>,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet,
  group: 'insert' | undefined
): Generator<number, TextAreaHistoryRecordResult> {
  if (group === 'insert' && state.history.currentGroup === group) {
    const previous = state.history.undo.at(-1)?.snapshot;
    const merged = previous === undefined
      ? undefined
      : mergeInsertionRecord(previous, after, forwardChanges);
    if (merged !== undefined) {
      const retainedBytes = yield* textAreaEditRecordBytesWork(
        merged.forwardChanges,
        merged.inverseChanges,
      );
      const history = yield* replaceEditHistoryGroupWork(
        state.history,
        merged,
        retainedBytes,
        group
      );
      return textAreaHistoryRecordResult(history, merged, retainedBytes);
    }
  }
  const record = textAreaEditRecord(state, after, forwardChanges, inverseChanges);
  return yield* recordTextAreaEditWork(state.history, record, group);
}

interface TextAreaHistoryRecordResult {
  readonly history: TextAreaEditHistory;
  readonly rejection?: TextAreaHistoryRejection;
}

function* recordTextAreaEditWork(
  history: TextAreaEditHistory,
  record: TextAreaEditRecord,
  group?: 'insert',
): Generator<number, TextAreaHistoryRecordResult> {
  const retainedBytes = yield* textAreaEditRecordBytesWork(record.forwardChanges, record.inverseChanges);
  return textAreaHistoryRecordResult(
    yield* recordEditHistoryWork(history, record, retainedBytes, group),
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

function* moveTextAreaHistoryEntryWork(
  history: TextAreaEditHistory,
  direction: 'undo' | 'redo',
): Generator<number, TextAreaEditHistory> {
  const entry = direction === 'undo' ? history.undo.at(-1) : history.redo.at(-1);
  if (entry === undefined) return yield* breakEditHistoryGroupWork(history);
  const undo = direction === 'undo'
    ? history.undo.slice(0, -1)
    : [...history.undo, entry];
  const redo = direction === 'undo'
    ? [...history.redo, entry]
    : history.redo.slice(0, -1);
  yield undo.length + redo.length;
  return Object.freeze({
    policy: history.policy,
    undo: Object.freeze(undo),
    redo: Object.freeze(redo),
    retainedBytes: history.retainedBytes,
  });
}

function* changeSetFromEditWork(
  edited: import('../text/index.ts').TextDocumentEditResult
): Generator<number, TextChangeSet> {
  const range = edited.changedRange;
  if (range === undefined) {
    throw new Error('A changed text document must report its exact changed range.');
  }
  return createTextChangeSet([{
    startOffset: range.startOffset,
    endOffsetExclusive: range.oldEndOffsetExclusive,
    insertedText: yield* textDocumentSliceWork(
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

function changesCaretAffinity(changeSet: TextChangeSet, explicitOffset: number | undefined, previous: TextCaret): TextCaret['position']['affinity'] {
  if (explicitOffset !== undefined) return previous.position.affinity;
  return (changeSet.changes.at(-1)?.insertedText.length ?? 0) > 0 ? 'upstream' : previous.position.affinity;
}

function* caretAfterChangesWork(changeSet: TextChangeSet): Generator<number, number> {
  let delta = 0;
  let caret = 0;
  for (const change of changeSet.changes) {
    yield 1;
    caret = change.startOffset + delta + change.insertedText.length;
    delta += change.insertedText.length - (change.endOffsetExclusive - change.startOffset);
  }
  return caret;
}

export function applyTextPointerTransition(
  state: TextEditBuffer,
  transition: TextPointerTransition
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, transition.offset);
  if (transition.kind === 'placeCaret') return { text: state.text, cursor: offset, ...(transition.affinity === undefined ? {} : { affinity: transition.affinity }) };
  const anchor = normalizeTextCursor(state.text, transition.anchor);
  const selection = normalizeTextSelection(state.text, {
    startOffset: anchor,
    endOffsetExclusive: offset
  });
  return {
    text: state.text,
    cursor: offset,
    ...(transition.affinity === undefined ? {} : { affinity: transition.affinity }),
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
