import { editTextBuffer } from '../text/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TextEditBuffer } from '../text/index.ts';

interface PromptTextBufferState {
  buffer: TextEditBuffer;
}

export function editPromptBufferForEvent(state: PromptTextBufferState, event: InputEvent): boolean {
  if (event.kind === 'text') {
    state.buffer = editTextBuffer(state.buffer, { kind: 'insert', text: event.text });
    return true;
  }
  if (event.kind === 'paste') {
    if (isMultilineText(event.text)) return false;
    state.buffer = editTextBuffer(state.buffer, { kind: 'insert', text: event.text });
    return true;
  }
  if (event.kind !== 'key') return false;
  switch (event.key) {
    case 'backspace':
      state.buffer = editTextBuffer(state.buffer, event.modifiers.alt || event.modifiers.ctrl ? { kind: 'deleteWordBackward' } : { kind: 'deleteBackward' });
      return true;
    case 'delete':
      state.buffer = editTextBuffer(state.buffer, event.modifiers.alt || event.modifiers.ctrl ? { kind: 'deleteWordForward' } : { kind: 'deleteForward' });
      return true;
    case 'arrowLeft':
      state.buffer = editTextBuffer(state.buffer, event.modifiers.alt || event.modifiers.ctrl
        ? { kind: 'moveWordLeft', select: event.modifiers.shift }
        : { kind: 'moveLeft', select: event.modifiers.shift });
      return true;
    case 'arrowRight':
      state.buffer = editTextBuffer(state.buffer, event.modifiers.alt || event.modifiers.ctrl
        ? { kind: 'moveWordRight', select: event.modifiers.shift }
        : { kind: 'moveRight', select: event.modifiers.shift });
      return true;
    case 'home':
      state.buffer = editTextBuffer(state.buffer, { kind: 'moveHome', select: event.modifiers.shift });
      return true;
    case 'end':
      state.buffer = editTextBuffer(state.buffer, { kind: 'moveEnd', select: event.modifiers.shift });
      return true;
    case 'pageUp':
      state.buffer = editTextBuffer(state.buffer, { kind: 'movePageUp', select: event.modifiers.shift });
      return true;
    case 'pageDown':
      state.buffer = editTextBuffer(state.buffer, { kind: 'movePageDown', select: event.modifiers.shift });
      return true;
    case 'space':
      state.buffer = editTextBuffer(state.buffer, { kind: 'insert', text: ' ' });
      return true;
    default:
      return false;
  }
}

export function isMultilineText(text: string): boolean {
  return text.includes('\n') || text.includes('\r');
}
