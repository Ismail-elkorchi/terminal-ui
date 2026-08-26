import { applyScrollEvent, createScrollState } from './scroll.ts';
import {
  breakEditHistoryGroup,
  createBoundedEditHistory,
  recordEditHistory,
  redoEditHistory,
  undoEditHistory
} from '../text/bounded-history.ts';
import {
  applyTextChangeSet,
  editTextDocument,
  createTextChangeSet,
  emptyTextChangeSet,
  invertTextChangeSet,
  editTextBuffer,
  normalizeTextCaret,
  normalizeTextCursor,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelectionModel,
  normalizeTextSelection,
  prepareTextDocument,
  textCaretAt,
  textDocumentSelectionBetween,
  textDocumentSlice
} from '../text/index.ts';
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
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TextAreaAction } from '../ui-model/text-area.ts';
import type { TextInputAction, TextInputPresentation } from '../ui-model/text-input.ts';

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

export type TextAreaEditHistory = BoundedEditHistory<TextAreaEditSnapshot>;

export interface TextAreaTransition {
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
  const document = prepareTextDocument(input.value);
  const caret = normalizeTextCaret(document, input.caret ?? textCaretAt(0));
  const selection = normalizeTextDocumentSelectionModel(document, input.selection);
  return {
    document,
    caret,
    ...(selection === undefined ? {} : { selection }),
    scroll: input.scroll ?? createScrollState(),
    revealCaret: true,
    history: createBoundedEditHistory(input.historyPolicy)
  };
}

export function textInputPresentation(state: TextEditBuffer): TextInputPresentation {
  const selection = normalizeTextSelection(state.text, state.selection);
  return {
    value: state.text,
    cursor: normalizeTextCursor(state.text, state.cursor),
    ...(selection === undefined ? {} : { selection })
  };
}

export function textInputReducer(state: TextEditBuffer, action: TextInputAction): TextEditBuffer {
  if (action.kind === 'edit') return editTextBuffer(state, action.operation);
  if (action.kind === 'pointer') return applyTextPointerAction(state, action.action);
  return state;
}

export function textAreaReducer(state: TextAreaState, action: TextAreaAction): TextAreaTransition {
  switch (action.kind) {
    case 'edit': {
      const edited = editTextDocument(state, action.operation);
      if (edited === state) return unchangedTextAreaTransition(state);
      const textChanged = edited.document !== state.document;
      const changeSet = textChanged
        ? changeSetFromEdit(edited)
        : emptyTextChangeSet;
      const inverseChanges = textChanged
        ? invertTextChangeSet(state.document, changeSet)
        : emptyTextChangeSet;
      const next: TextAreaState = {
        document: edited.document,
        caret: edited.caret,
        ...(edited.selection === undefined ? {} : { selection: edited.selection }),
        scroll: state.scroll,
        revealCaret: true,
        history: textChanged
          ? recordEditHistory(
              state.history,
              textAreaSnapshot(state, changeSet, inverseChanges),
              textAreaSnapshotBytes(state, changeSet, inverseChanges)
            )
          : breakEditHistoryGroup(state.history)
      };
      return textAreaTransition(next, changeSet);
    }
    case 'applyChanges': {
      const changeSet = createTextChangeSet(action.changeSet.changes);
      if (changeSet.changes.length === 0) return unchangedTextAreaTransition(state);
      const inverseChanges = invertTextChangeSet(state.document, changeSet);
      const document = applyTextChangeSet(state.document, changeSet);
      const requestedCaret = action.caretOffset ?? caretAfterChanges(changeSet);
      const next: TextAreaState = {
        document,
        caret: textCaretAt(normalizeTextDocumentOffset(document, requestedCaret)),
        scroll: state.scroll,
        revealCaret: true,
        history: recordEditHistory(
          state.history,
          textAreaSnapshot(state, changeSet, inverseChanges),
          textAreaSnapshotBytes(state, changeSet, inverseChanges)
        )
      };
      return textAreaTransition(next, changeSet);
    }
    case 'undo':
      return restoreTextAreaHistory(state, 'undo');
    case 'redo':
      return restoreTextAreaHistory(state, 'redo');
    case 'pointer': {
      const offset = normalizeTextDocumentOffset(state.document, action.action.offset);
      const selected = action.action.kind === 'placeCaret'
        ? textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
          caret: textCaretAt(offset),
          revealCaret: true
        }, undefined)
        : textAreaStateWithSelection(breakTextAreaHistoryGroup(state), {
          caret: textCaretAt(offset),
          revealCaret: true
        }, normalizeTextDocumentSelectionModel(
          state.document,
          textDocumentSelectionBetween(
            normalizeTextDocumentOffset(state.document, action.action.anchor),
            offset,
          ),
        ));
      if (action.scroll === undefined) return textAreaTransition(selected, emptyTextChangeSet);
      return textAreaTransition({
        ...selected,
        scroll: applyScrollEvent(selected.scroll, action.scroll),
        revealCaret: false,
      }, emptyTextChangeSet);
    }
    case 'scroll': {
      const scroll = applyScrollEvent(state.scroll, action.event);
      if (scroll === state.scroll && !state.revealCaret) return unchangedTextAreaTransition(state);
      return textAreaTransition({ ...state, scroll, revealCaret: false }, emptyTextChangeSet);
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
): TextAreaTransition {
  const entry = direction === 'undo' ? state.history.undo.at(-1) : state.history.redo.at(-1);
  if (entry === undefined) {
    const history = breakEditHistoryGroup(state.history);
    return unchangedTextAreaTransition(history === state.history ? state : { ...state, history });
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
    return unchangedTextAreaTransition(
      transition.history === state.history ? state : { ...state, history: transition.history }
    );
  }
  const snapshot = transition.snapshot;
  return textAreaTransition({
    document: snapshot.document,
    caret: snapshot.caret,
    ...(snapshot.selection === undefined ? {} : { selection: snapshot.selection }),
    scroll: state.scroll,
    revealCaret: true,
    history: transition.history
  }, direction === 'undo' ? snapshot.inverseChanges : snapshot.forwardChanges);
}

function textAreaSnapshot(
  state: TextAreaState,
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
  state: TextAreaState,
  forwardChanges: TextChangeSet,
  inverseChanges: TextChangeSet
): number {
  const changeBytes = [...forwardChanges.changes, ...inverseChanges.changes]
    .reduce((total, change) => total + change.insertedText.length * 2 + 24, 0);
  return textDocumentBytes(state.document) + changeBytes + 32;
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

function textAreaTransition(state: TextAreaState, changeSet: TextChangeSet): TextAreaTransition {
  return Object.freeze({ state, changeSet });
}

function unchangedTextAreaTransition(state: TextAreaState): TextAreaTransition {
  return textAreaTransition(state, emptyTextChangeSet);
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

export function applyTextPointerAction(
  state: TextEditBuffer,
  action: TextPointerAction
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, action.offset);
  if (action.kind === 'placeCaret') return { text: state.text, cursor: offset };
  const anchor = normalizeTextCursor(state.text, action.anchor);
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

export function selectionFromTextPointerAction(
  action: TextPointerAction
): TextSelection | undefined {
  if (action.kind === 'placeCaret') return undefined;
  const start = Math.max(0, Math.floor(Math.min(action.anchor, action.offset)));
  const end = Math.max(start, Math.floor(Math.max(action.anchor, action.offset)));
  return start === end
    ? undefined
    : { startOffset: start, endOffsetExclusive: end };
}
