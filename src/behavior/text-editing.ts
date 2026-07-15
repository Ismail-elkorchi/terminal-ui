import { applyScrollEvent } from './scroll.ts';
import { editTextBuffer, normalizeTextCursor, normalizeTextSelection } from '../text/index.ts';
import type { TextEditBuffer, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  TextAreaAction,
  TextAreaScrollablePresentation
} from '../ui-model/text-area.ts';
import type { TextInputAction, TextInputPresentation } from '../ui-model/text-input.ts';

export interface TextAreaState {
  readonly input: TextEditBuffer;
  readonly scroll: ScrollState;
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
  return action.kind === 'edit'
    ? editTextBuffer(state, action.operation)
    : applyTextPointerAction(state, action.action);
}

export function textAreaPresentation(state: TextAreaState): TextAreaScrollablePresentation {
  return {
    ...textInputPresentation(state.input),
    scroll: state.scroll
  };
}

export function textAreaReducer(state: TextAreaState, action: TextAreaAction): TextAreaState {
  switch (action.kind) {
    case 'edit':
      return { ...state, input: editTextBuffer(state.input, action.operation) };
    case 'pointer':
      return { ...state, input: applyTextPointerAction(state.input, action.action) };
    case 'scroll':
      return { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
}

export function applyTextPointerAction(
  state: TextEditBuffer,
  action: TextPointerAction
): TextEditBuffer {
  const offset = normalizeTextCursor(state.text, action.offset);
  if (action.kind === 'placeCaret') return { text: state.text, cursor: offset };
  const anchor = normalizeTextCursor(state.text, action.anchor);
  const selection = normalizeTextSelection(state.text, { start: anchor, end: offset });
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
  return start === end ? undefined : { start, end };
}
