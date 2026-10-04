import { terminalTextIndexForOwner } from '../../text/terminal-text-index.ts';
import type { ElementKeyHandler } from '../../element/metadata.ts';
import type { TerminalTextIndex, TextEditOperation, TextPosition, TextSelection } from '../../text/types.ts';
import { createTextInputKeymap, type TextInputKeyAction, type TextEditingKeyAction } from '../keymaps.ts';
import { controlKeyBindings } from './control-key-bindings.ts';

export interface TextEditingTransition {
  readonly kind: 'edit';
  readonly operation: TextEditOperation;
}

const defaultEditingKeymap = createTextInputKeymap();

export interface TextEditingVisualInput {
  readonly index: TerminalTextIndex;
  readonly position: TextPosition;
  readonly selection?: TextSelection;
  readonly sourceOffsetForDisplay?: (offset: number) => number;
}

export function textEditingVisualInput(
  buffer: import('../../text/types.ts').TextEditBuffer,
  options: import('../../text/types.ts').TextIndexOptions,
  sourceOffsetForDisplay?: (offset: number) => number,
  sourceOwner: object = buffer,
): TextEditingVisualInput | undefined {
  if (options.textPresentation === undefined) return undefined;
  return { index: terminalTextIndexForOwner(sourceOwner, buffer.text, options),
    position: { offset: buffer.cursor, affinity: buffer.affinity ?? 'downstream' },
    ...(buffer.selection === undefined ? {} : { selection: buffer.selection }),
    ...(sourceOffsetForDisplay === undefined ? {} : { sourceOffsetForDisplay }),
  };
}

export function textEditingHandlers(readOnly: boolean, visual?: TextEditingVisualInput): Readonly<
  Partial<Record<TextEditingKeyAction, ElementKeyHandler<TextEditingTransition>>>
> {
  const operation = (value: TextEditOperation) => () => ({ kind: 'edit' as const, operation: value });
  const navigate = (kind: 'moveLeft' | 'moveRight' | 'moveHome' | 'moveEnd' | 'moveWordLeft' | 'moveWordRight', extendSelection = false) => {
    if (visual === undefined) return operation({ kind, ...(extendSelection ? { extendSelection } : {}) });
    let destination = kind === 'moveHome' ? visual.index.visualColumnToPosition(0)
      : kind === 'moveEnd' ? visual.index.visualColumnToPosition(visual.index.cells)
      : kind === 'moveWordLeft' || kind === 'moveWordRight'
      ? visual.index.moveVisualWordPosition(visual.position, kind === 'moveWordLeft' ? -1 : 1)
      : visual.index.moveVisualPosition(visual.position, kind === 'moveLeft' ? -1 : 1);
    if (kind === 'moveLeft' || kind === 'moveRight') {
      destination = projectedNavigationPosition(visual, destination, kind === 'moveLeft' ? -1 : 1);
    }
    if (!extendSelection && visual.selection !== undefined && kind !== 'moveHome' && kind !== 'moveEnd') {
      const start = { offset: visual.selection.startOffset, affinity: 'downstream' as const };
      const end = { offset: visual.selection.endOffsetExclusive, affinity: 'upstream' as const };
      const ordered = visual.index.positionToVisualColumn(start) <= visual.index.positionToVisualColumn(end) ? [start, end] : [end, start];
      destination = (kind === 'moveLeft' || kind === 'moveWordLeft' ? ordered[0] : ordered[1]) ?? destination;
    }
    return operation({ kind: 'moveTo', caret: { position: {
      offset: visual.sourceOffsetForDisplay?.(destination.offset) ?? destination.offset, affinity: destination.affinity,
    } }, ...(extendSelection ? { extendSelection } : {}) });
  };
  return {
    moveLeft: navigate('moveLeft'),
    moveRight: navigate('moveRight'),
    moveHome: navigate('moveHome'),
    moveEnd: navigate('moveEnd'),
    selectLeft: navigate('moveLeft', true),
    selectRight: navigate('moveRight', true),
    selectHome: navigate('moveHome', true),
    selectEnd: navigate('moveEnd', true),
    moveWordLeft: navigate('moveWordLeft'),
    moveWordRight: navigate('moveWordRight'),
    selectWordLeft: navigate('moveWordLeft', true),
    selectWordRight: navigate('moveWordRight', true),
    selectAll: operation({ kind: 'selectAll' }),
    ...(readOnly ? {} : {
      deleteBackward: operation({ kind: 'deleteBackward' }),
      deleteForward: operation({ kind: 'deleteForward' }),
      deleteWordBackward: operation({ kind: 'deleteWordBackward' }),
      deleteWordForward: operation({ kind: 'deleteWordForward' }),
    }),
  };
}

export function textEditingTriggers(readOnly: boolean, visual?: TextEditingVisualInput) {
  return controlKeyBindings<TextInputKeyAction, TextEditingTransition>(defaultEditingKeymap, textEditingHandlers(readOnly, visual)).triggers ?? [];
}

/** Projection-only cell stops, such as spaces inside a tab, are not source edges. */
function projectedNavigationPosition(visual: TextEditingVisualInput, position: TextPosition, delta: -1 | 1): TextPosition {
  if (visual.sourceOffsetForDisplay === undefined) return position;
  const original = visual.sourceOffsetForDisplay(visual.position.offset);
  let destination = position;
  while (destination.offset !== visual.position.offset
    && visual.sourceOffsetForDisplay(destination.offset) === original) {
    const next = visual.index.moveVisualPosition(destination, delta);
    if (next.offset === destination.offset && next.affinity === destination.affinity) break;
    destination = next;
  }
  return destination;
}
