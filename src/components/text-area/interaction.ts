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
import type { TextCaret, TextPosition, TextSelection } from '../../text/types.ts';
import type { TextAreaGeometry } from './geometry.ts';
import { projectedCaret, textAreaGeometry } from './geometry.ts';
import type { TextAreaLayoutLine } from './layout.ts';
import type { TextAreaModel } from './model.ts';

export type TextAreaComponentAction = { readonly kind: 'layoutRequest'; readonly request: import('./contracts.ts').TextAreaLayoutRequest } | TextAreaTransition | { readonly kind: 'layout'; readonly snapshot: import('./contracts.ts').TextAreaLayoutSnapshot } | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

/** Pending geometry cannot produce meaningful absolute visual coordinates. Surface
 * an explicit rejected intent instead of dropping keys or moving on guessed rows. */
export function textAreaPendingVisualHandlers(input: ComponentInput<TextAreaModel>): Readonly<Partial<Record<TextAreaKeyAction, ElementKeyHandler<TextAreaComponentAction>>>> {
  const unavailable = () => ({ kind: 'unavailable' as const, reason: 'layout-pending' as const });
  return {
    ...(input.textPresentation === undefined ? {} : { moveLeft: unavailable, moveRight: unavailable, selectLeft: unavailable, selectRight: unavailable,
      moveWordLeft: unavailable, moveWordRight: unavailable, selectWordLeft: unavailable, selectWordRight: unavailable }),
    moveLineUp: unavailable, moveLineDown: unavailable, selectLineUp: unavailable, selectLineDown: unavailable,
    previousPage: unavailable, nextPage: unavailable, selectPreviousPage: unavailable, selectNextPage: unavailable,
    moveHome: unavailable, moveEnd: unavailable, selectHome: unavailable, selectEnd: unavailable,
    moveDocumentStart: () => ({ kind: 'edit', operation: { kind: 'moveDocumentStart' } }),
    moveDocumentEnd: () => ({ kind: 'edit', operation: { kind: 'moveDocumentEnd' } }),
    selectDocumentStart: () => ({ kind: 'edit', operation: { kind: 'moveDocumentStart', extendSelection: true } }),
    selectDocumentEnd: () => ({ kind: 'edit', operation: { kind: 'moveDocumentEnd', extendSelection: true } }),
  };
}

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
    ...(input.textPresentation === undefined ? {} : {
      moveLeft: horizontalMove(input, -1), moveRight: horizontalMove(input, 1),
      selectLeft: horizontalMove(input, -1, true), selectRight: horizontalMove(input, 1, true),
      moveWordLeft: horizontalMove(input, -1, false, true), moveWordRight: horizontalMove(input, 1, false, true),
      selectWordLeft: horizontalMove(input, -1, true, true), selectWordRight: horizontalMove(input, 1, true, true),
    }),
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

function horizontalMove(input: ComponentInput<TextAreaModel>, delta: -1 | 1, extendSelection = false, word = false): ElementKeyHandler<TextAreaComponentAction> {
  return () => {
    const geometry = textAreaGeometry(input);
    const selection = input.model.selection;
    let position: TextPosition;
    if (!extendSelection && selection !== undefined && selection.anchor.offset !== selection.focus.offset) {
      const a = projectedCaret(geometry.projection, { position: selection.anchor }).position;
      const b = projectedCaret(geometry.projection, { position: selection.focus }).position;
      const left = geometry.layout.cursorAt(a.offset, a.affinity);
      const right = geometry.layout.cursorAt(b.offset, b.affinity);
      const order = left.rowIndex - right.rowIndex || left.columnCells - right.columnCells;
      position = (order <= 0) === (delta < 0) ? selection.anchor : selection.focus;
    } else {
      const caret = projectedCaret(geometry.projection, input.model.caret);
      const current = geometry.layout.cursorAt(caret.position.offset, caret.position.affinity);
      const line = geometry.layout.lineAtRow(current.rowIndex);
      if (line === undefined) return ignoreMessage();
      const local = { ...caret.position, offset: caret.position.offset - line.start };
      position = word
        ? visualWordPosition(geometry, line, local, delta)
        : visualArrowPosition(geometry, line, local, delta, input.model.caret.position);
    }
    return { kind: 'edit', operation: { kind: 'moveTo', caret: { position }, extendSelection } };
  };
}

function visualArrowPosition(geometry: TextAreaGeometry, first: TextAreaLayoutLine, initial: TextPosition, delta: -1 | 1, original: TextPosition): TextPosition {
  let line = first;
  let local = initial;
  for (;;) {
    let moved = line.index.moveVisualPosition(local, delta);
    if (moved.offset === local.offset && moved.affinity === local.affinity) {
      const next = geometry.layout.lineAtRow(line.rowIndex + delta);
      if (next === undefined) return original;
      line = next;
      moved = line.index.visualColumnToPosition(delta < 0 ? line.index.cells : 0);
    }
    const displayOffset = line.start + moved.offset;
    const position = sourcePositionAtDisplayBoundary(geometry, { offset: displayOffset, affinity: moved.affinity });
    if (position !== undefined && (position.offset !== original.offset || position.affinity !== original.affinity)) return position;
    // Expanded tabs and replacement decorations expose no editable source
    // boundary inside their visual extent. Continue along the same owned map.
    local = moved;
  }
}

function sourcePositionAtDisplayBoundary(geometry: TextAreaGeometry, display: TextPosition): TextPosition | undefined {
  for (const affinity of [display.affinity, display.affinity === 'upstream' ? 'downstream' as const : 'upstream' as const]) {
    const offset = geometry.projection.sourceOffsetAtDisplayOffset(display.offset, affinity);
    if (geometry.projection.displayOffsetAtSourceOffset(offset, affinity) === display.offset) return { offset, affinity };
  }
  return undefined;
}

/** Row indexes own physical word movement; the document's existing word index
 * determines whether a word continues over a soft wrap. */
function visualWordPosition(geometry: TextAreaGeometry, first: TextAreaLayoutLine, initial: TextPosition, delta: -1 | 1): TextPosition {
  let line = first;
  let local = initial;
  for (;;) {
    const moved = line.index.moveVisualWordPosition(local, delta);
    const column = line.index.positionToVisualColumn(moved);
    const next = geometry.layout.lineAtRow(line.rowIndex + delta);
    const destination = { ...moved, offset: geometry.projection.sourceOffsetAtDisplayOffset(line.start + moved.offset, moved.affinity) };
    if (next === undefined || column !== (delta < 0 ? 0 : line.index.cells)) return destination;
    const crossed = delta < 0 ? line.index.visualGraphemes[0] : line.index.visualGraphemes.at(-1);
    const range = crossed === undefined ? undefined : textAreaWordSelectionAt(geometry.document, line.start + crossed.startOffset);
    if (line.index.positionToVisualColumn(local) !== column && range !== undefined && crossed !== undefined
      && line.start + crossed.startOffset >= range.startOffset && line.start + crossed.endOffsetExclusive <= range.endOffsetExclusive) {
      const entering = delta < 0 ? next.index.visualGraphemes.at(-1) : next.index.visualGraphemes[0];
      if (next.logicalLineIndex !== line.logicalLineIndex || entering === undefined) return destination;
      const entry = next.index.visualColumnToPosition(delta < 0 ? next.index.cells : 0);
      if (line.start + moved.offset !== next.start + entry.offset) return destination;
      const nextRange = textAreaWordSelectionAt(geometry.document, next.start + entering.startOffset);
      if (nextRange.startOffset !== range.startOffset || nextRange.endOffsetExclusive !== range.endOffsetExclusive) return destination;
    }
    line = next;
    local = line.index.visualColumnToPosition(delta < 0 ? line.index.cells : 0);
  }
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
  const local = line.index.visualColumnToPosition(Math.max(0, columnCells));
  const affinity = local.affinity;
  return {
    position: {
      offset: geometry.projection.sourceOffsetAtDisplayOffset(line.start + local.offset, affinity),
      affinity,
    },
  };
}

export function pointerPosition(input: ComponentInput<TextAreaModel>, row: number, column: number): TextPosition {
  const geometry = textAreaGeometry(input);
  const rowIndex = Math.max(
    0,
    Math.min(
      geometry.layout.contentRows - 1,
      geometry.scrollbar.scroll.offsetRow + row - 1,
    ),
  );
  const line = geometry.layout.lineAtRow(rowIndex);
  if (line === undefined) return { offset: textDocumentLength(input.model.document), affinity: 'upstream' };
  const horizontalOrigin = line.index.positionToVisualColumn(
    line.index.visualColumnToPosition(geometry.scrollbar.scroll.offsetColumn),
  );
  const visualColumn = Math.max(0, column - 1 + horizontalOrigin);
  const position = visualCaretAt(geometry, rowIndex, visualColumn).position;
  return { ...position, offset: normalizeTextDocumentOffset(input.model.document, position.offset) };
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
