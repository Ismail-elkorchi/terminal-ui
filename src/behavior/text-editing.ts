import { applyScrollRequest, createScrollState } from './scroll.ts';
import {
  breakEditHistoryGroup,
  createBoundedEditHistory,
  recordEditHistory,
  replaceEditHistoryGroup,
  redoEditHistory,
  undoEditHistory
} from '../text/bounded-history.ts';
import {
  editTextDocument,
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
import { textDocumentBytes } from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextAreaTransition } from './text-area.ts';
import type { TextInputTransition, TextInputState } from './text-input.ts';

export interface TextAreaState {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll: ScrollState;
  readonly revealCaret: boolean;
  readonly history: TextAreaEditHistory;
}

export interface TextAreaEditSnapshot {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly forwardChanges: TextChangeSet;
  readonly inverseChanges: TextChangeSet;
}

export type TextAreaEditHistory = BoundedEditHistory<TextAreaEditSnapshot, 'insert'>;

export interface TextAreaReduction {
  readonly state: TextAreaState;
  readonly changeSet: TextChangeSet;
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
    history: createBoundedEditHistory(input.historyPolicy)
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
      const next: TextAreaState = {
        document: edited.document,
        caret: edited.caret,
        ...(edited.selection === undefined ? {} : { selection: edited.selection }),
        scroll: state.scroll,
        revealCaret: true,
        history: textChanged
          ? recordTextAreaHistory(state, changeSet, inverseChanges, group)
          : breakEditHistoryGroup(state.history)
      };
      return textAreaReduction(next, changeSet);
    }
    case 'applyChanges': {
      const changePlan = createTextChangePlan(state.document, transition.changeSet);
      if (changePlan.changes.length === 0) return unchangedTextAreaReduction(state);
      const document = applyTextChangePlan(state.document, changePlan);
      if (document === state.document) return unchangedTextAreaReduction(state);
      const inverseChanges = invertTextChangePlan(state.document, changePlan);
      const requestedCaret = transition.caretOffset ?? caretAfterChanges(changePlan);
      const next: TextAreaState = {
        document,
        caret: textCaretAt(normalizeTextDocumentOffset(document, requestedCaret)),
        scroll: state.scroll,
        revealCaret: true,
        history: recordEditHistory(
          state.history,
          textAreaSnapshot(state, changePlan, inverseChanges),
          textAreaSnapshotBytes(state, changePlan, inverseChanges)
        )
      };
      return textAreaReduction(next, changePlan);
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
  const current = textAreaSnapshot(
    state,
    entry.snapshot.forwardChanges,
    entry.snapshot.inverseChanges
  );
  const transition = direction === 'undo'
    ? undoEditHistory(
        state.history,
        current,
        textAreaSnapshotBytes(state, current.forwardChanges, current.inverseChanges)
      )
    : redoEditHistory(
        state.history,
        current,
        textAreaSnapshotBytes(state, current.forwardChanges, current.inverseChanges)
      );
  if (transition.snapshot === undefined) {
    return unchangedTextAreaReduction(
      transition.history === state.history ? state : { ...state, history: transition.history }
    );
  }
  const snapshot = transition.snapshot;
  return textAreaReduction({
    document: snapshot.document,
    caret: snapshot.caret,
    ...(snapshot.selection === undefined ? {} : { selection: snapshot.selection }),
    scroll: state.scroll,
    revealCaret: true,
    history: transition.history
  }, direction === 'undo' ? snapshot.inverseChanges : snapshot.forwardChanges);
}

function textAreaSnapshot(
  state: Pick<TextAreaState, 'document' | 'caret' | 'selection'>,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): TextAreaEditSnapshot {
  return Object.freeze({
    document: state.document,
    caret: state.caret,
    ...(state.selection === undefined ? {} : { selection: state.selection }),
    forwardChanges,
    inverseChanges
  });
}

function textAreaSnapshotBytes(
  state: Pick<TextAreaState, 'document'>,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): number {
  const changeBytes = [...forwardChanges.changes, ...inverseChanges.changes]
    .reduce((total, change) => total + change.insertedText.length * 2 + 24, 0);
  return textDocumentBytes(state.document) + changeBytes + 32;
}

function recordTextAreaHistory(
  state: TextAreaState,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet,
  group: 'insert' | undefined
): TextAreaEditHistory {
  if (group === 'insert' && state.history.currentGroup === group) {
    const previous = state.history.undo.at(-1)?.snapshot;
    const merged = previous === undefined
      ? undefined
      : mergeInsertionSnapshot(previous, forwardChanges);
    if (merged !== undefined) {
      return replaceEditHistoryGroup(
        state.history,
        merged,
        textAreaSnapshotBytes(merged, merged.forwardChanges, merged.inverseChanges),
        group
      );
    }
  }
  return recordEditHistory(
    state.history,
    textAreaSnapshot(state, forwardChanges, inverseChanges),
    textAreaSnapshotBytes(state, forwardChanges, inverseChanges),
    group
  );
}

function mergeInsertionSnapshot(
  snapshot: TextAreaEditSnapshot,
  nextChanges: TextChangeSet
): TextAreaEditSnapshot | undefined {
  const previous = snapshot.forwardChanges.changes[0];
  const next = nextChanges.changes[0];
  if (
    snapshot.forwardChanges.changes.length !== 1
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
  const inverse = snapshot.inverseChanges.changes[0];
  if (inverse === undefined || snapshot.inverseChanges.changes.length !== 1) return undefined;
  const inverseChanges = createTextChangeSet([{
    startOffset: inverse.startOffset,
    endOffsetExclusive: inverse.endOffsetExclusive + next.insertedText.length,
    insertedText: inverse.insertedText
  }]);
  return textAreaSnapshot(snapshot, forwardChanges, inverseChanges);
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

function textAreaReduction(state: TextAreaState, changeSet: TextChangeSet): TextAreaReduction {
  return Object.freeze({ state, changeSet });
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
