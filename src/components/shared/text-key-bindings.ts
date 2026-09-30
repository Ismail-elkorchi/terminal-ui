import type { ElementKeyHandler } from '../../element/metadata.ts';
import type { TextEditOperation } from '../../text/types.ts';
import { createTextInputKeymap, type TextInputKeyAction, type TextEditingKeyAction } from '../keymaps.ts';
import { controlKeyBindings } from './control-key-bindings.ts';

export interface TextEditingTransition {
  readonly kind: 'edit';
  readonly operation: TextEditOperation;
}

const defaultEditingKeymap = createTextInputKeymap();

export function textEditingHandlers(readOnly: boolean): Readonly<
  Partial<Record<TextEditingKeyAction, ElementKeyHandler<TextEditingTransition>>>
> {
  const operation = (value: TextEditOperation) => () => ({ kind: 'edit' as const, operation: value });
  return {
    moveLeft: operation({ kind: 'moveLeft' }),
    moveRight: operation({ kind: 'moveRight' }),
    moveHome: operation({ kind: 'moveHome' }),
    moveEnd: operation({ kind: 'moveEnd' }),
    selectLeft: operation({ kind: 'moveLeft', extendSelection: true }),
    selectRight: operation({ kind: 'moveRight', extendSelection: true }),
    selectHome: operation({ kind: 'moveHome', extendSelection: true }),
    selectEnd: operation({ kind: 'moveEnd', extendSelection: true }),
    moveWordLeft: operation({ kind: 'moveWordLeft' }),
    moveWordRight: operation({ kind: 'moveWordRight' }),
    selectWordLeft: operation({ kind: 'moveWordLeft', extendSelection: true }),
    selectWordRight: operation({ kind: 'moveWordRight', extendSelection: true }),
    selectAll: operation({ kind: 'selectAll' }),
    ...(readOnly ? {} : {
      deleteBackward: operation({ kind: 'deleteBackward' }),
      deleteForward: operation({ kind: 'deleteForward' }),
      deleteWordBackward: operation({ kind: 'deleteWordBackward' }),
      deleteWordForward: operation({ kind: 'deleteWordForward' }),
    }),
  };
}

export function textEditingTriggers(readOnly: boolean) {
  return controlKeyBindings<TextInputKeyAction, TextEditingTransition>(defaultEditingKeymap, textEditingHandlers(readOnly)).triggers ?? [];
}
