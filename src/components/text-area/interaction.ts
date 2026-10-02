import type { ElementKeyHandler } from '../../element/metadata.ts';
import type { TextAreaKeyAction } from '../keymaps.ts';
import { scrollReducer } from '../../behavior/scroll.ts';
import type { TextAreaTransition } from '../../behavior/text-area.ts';
import type { ComponentInput } from '../../component/contracts.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { TextDocument } from '../../text/document.ts';
import {
  normalizeTextDocumentOffset,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineBoundaries,
  textDocumentLineIndexAtOffset,
} from '../../text/document.ts';
import { ownedWordBoundaryIndex } from '../../text/word-boundaries.ts';
import type { TextCaret, TextSelection } from '../../text/types.ts';
import type { TextAreaGeometry } from './geometry.ts';
import { projectedCaret, textAreaGeometry } from './geometry.ts';
import type { TextAreaModel } from './model.ts';

export type TextAreaComponentAction = { readonly kind: 'layoutRequest'; readonly request: import('./contracts.ts').TextAreaLayoutRequest } | TextAreaTransition | { readonly kind: 'layout'; readonly snapshot: import('./contracts.ts').TextAreaLayoutSnapshot } | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

export function textAreaVisualHandlers(input: ComponentInput<TextAreaModel>): Readonly<
  Partial<Record<TextAreaKeyAction, ElementKeyHandler<TextAreaComponentAction>>>
> {
  const move = (key: 'arrowUp' | 'arrowDown' | 'pageUp' | 'pageDown' | 'home' | 'end', shift = false) => () => {
    const geometry = textAreaGeometry(input);
    const caret = projectedCaret(geometry.projection, input.model.caret);
    const current = geometry.layout.cursorAt(caret.position.offset, caret.position.affinity);
    const vertical = key === 'arrowUp' || key === 'arrowDown'
      || key === 'pageUp' || key === 'pageDown';
    const preferredColumnCells = vertical
      ? caret.preferredColumnCells ?? current.columnCells
      : undefined;
    const delta = key === 'arrowUp' ? -1
      : key === 'arrowDown' ? 1
      : key === 'pageUp' ? -Math.max(1, geometry.scrollbar.contentBounds.height)
      : key === 'pageDown' ? Math.max(1, geometry.scrollbar.contentBounds.height)
      : 0;
    const row = Math.max(0, Math.min(geometry.layout.contentRows - 1, current.rowIndex + delta));
    const line = geometry.layout.lineAtRow(row);
    if (line === undefined) return ignoreMessage();
    const destinationColumn = key === 'home' ? 0
      : key === 'end' ? line.index.cells
      : preferredColumnCells ?? 0;
    const destination = visualCaretAt(geometry, row, destinationColumn);
    return {
      kind: 'edit' as const,
      operation: {
        kind: 'moveTo' as const,
        caret: {
          position: destination.position,
          ...(preferredColumnCells === undefined ? {} : { preferredColumnCells }),
        },
        extendSelection: shift,
      },
    };
  };
  return {
    moveLineUp: move('arrowUp'), moveLineDown: move('arrowDown'),
    selectLineUp: move('arrowUp', true), selectLineDown: move('arrowDown', true),
    previousPage: move('pageUp'), nextPage: move('pageDown'),
    selectPreviousPage: move('pageUp', true), selectNextPage: move('pageDown', true),
    moveHome: move('home'), moveEnd: move('end'),
    selectHome: move('home', true), selectEnd: move('end', true),
    moveDocumentStart: () => ({ kind: 'edit', operation: { kind: 'moveDocumentStart' } }),
    moveDocumentEnd: () => ({ kind: 'edit', operation: { kind: 'moveDocumentEnd' } }),
    selectDocumentStart: () => ({ kind: 'edit', operation: { kind: 'moveDocumentStart', extendSelection: true } }),
    selectDocumentEnd: () => ({ kind: 'edit', operation: { kind: 'moveDocumentEnd', extendSelection: true } }),
  };
}

function visualCaretAt(
  geometry: TextAreaGeometry,
  row: number,
  columnCells: number,
): TextCaret {
  const line = geometry.layout.lineAtRow(row);
  if (line === undefined) return {
    position: { offset: 0, affinity: 'downstream' },
  };
  const local = line.index.graphemeIndexToCodeUnitOffset(
    line.index.visualColumnToGraphemeIndex(Math.max(0, columnCells)),
  );
  const affinity = local === line.text.length ? 'upstream' as const : 'downstream' as const;
  return {
    position: {
      offset: geometry.projection.sourceOffsetAtDisplayOffset(line.start + local, affinity),
      affinity,
    },
  };
}

export function pointerOffset(input: ComponentInput<TextAreaModel>, row: number, column: number): number {
  const geometry = textAreaGeometry(input);
  const rowIndex = Math.max(
    0,
    Math.min(
      geometry.layout.contentRows - 1,
      geometry.scrollbar.scroll.offsetRow + row - 1,
    ),
  );
  const line = geometry.layout.lineAtRow(rowIndex);
  if (line === undefined) return textDocumentLength(input.model.document);
  const visualColumn = Math.max(
    0,
    column - 1 - geometry.prefixWidth + geometry.scrollbar.scroll.offsetColumn,
  );
  return normalizeTextDocumentOffset(
    input.model.document,
    visualCaretAt(geometry, rowIndex, visualColumn).position.offset,
  );
}

export function textAreaDragScrollRequest(
  input: ComponentInput<TextAreaModel>,
  geometry: TextAreaGeometry,
  transition: import('../../interaction/text-pointer.ts').TextPointerTransition,
  event: import('../../input/pointer.ts').RoutedPointerEvent,
): import('../../interaction/scroll.ts').ScrollRequest | undefined {
  if (input.model.scroll === undefined || transition.kind !== 'extendSelection') return undefined;
  const localRow = event.localRow ?? event.row - geometry.scrollbar.contentBounds.row + 1;
  const rows = localRow < 1
    ? -1
    : localRow > geometry.scrollbar.contentBounds.height
    ? 1
    : 0;
  if (rows === 0) return undefined;
  const nextState = scrollReducer(
    geometry.scrollbar.scroll,
    { kind: 'scrollLines', rows },
    geometry.scrollbar.geometry,
  );
  return nextState === geometry.scrollbar.scroll
    ? undefined
    : { nextState, source: 'drag', target: 'content' };
}

export function textAreaWordSelectionAt(
  document: TextDocument,
  offset: number,
): TextSelection {
  const normalized = normalizeTextDocumentOffset(document, offset);
  const lineIndex = textDocumentLineIndexAtOffset(document, normalized);
  const line = textDocumentLineAt(document, lineIndex);
  if (line === undefined) return { startOffset: normalized, endOffsetExclusive: normalized };
  const local = ownedWordBoundaryIndex(textDocumentLineBoundaries(document, line)).selectionAt(
    normalized - line.startOffset,
  );
  return {
    startOffset: line.startOffset + local.startOffset,
    endOffsetExclusive: line.startOffset + local.endOffsetExclusive,
  };
}
