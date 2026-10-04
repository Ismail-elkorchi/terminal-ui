import type { TextDocument } from '../../text/document.ts';
import type { TextAreaDocumentLayout } from './layout.ts';
import type { TextAreaGeometry } from './geometry-contracts.ts';
export type { TextAreaGeometry } from './geometry-contracts.ts';
import { createRowOffsetMapWork } from '../../text/row-offset-map.ts';
import { finishWork } from '../../foundation/cooperative-work.ts';
import { measurePreparedTextArea, preparedTextAreaGeometry } from './prepared-layout.ts';
import type { ComponentLayoutCommitInput } from '../../component/contracts.ts';
import type { TextAreaLayoutSnapshot } from './contracts.ts';
import { scrollReducer } from '../../behavior/scroll.ts';
import type { ComponentInput, ComponentMeasureInput } from '../../component/contracts.ts';
import { layoutComponentScrollbar } from '../../component/scrollbar.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { Measurement } from '../../renderer/contracts.ts';
import {
  createTextDocumentWork,
  textDocumentLength,
  textDocumentLineCount,
} from '../../text/document.ts';
import { sourceBoundaries } from '../../text/source-boundaries.ts';
import { sourceGeometry } from '../../text/source-geometry.ts';
import { ownedTerminalTextIndex } from '../../text/terminal-text-index.ts';
import { sanitizeTerminalCellTextWork } from '../../text/sanitize.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { TextCaret, TextWidthProfile } from '../../text/types.ts';
import { textWidthProfileKey } from '../../text/width-profile.ts';
import { emptyTextAreaDecorations, readTextAreaDecorations } from './decorations.ts';
import { layoutTextAreaDocumentWork } from './layout.ts';
import type { TextAreaModel } from './model.ts';
import { createTextAreaProjectionWork, type TextAreaProjection } from './projection.ts';

export function measureTextArea(input: ComponentMeasureInput<TextAreaModel>): Measurement {
  return input.model.preparedLayout === undefined
    ? finishWork(measureTextAreaWork(input)) : measurePreparedTextArea(input);
}

export function* measureTextAreaWork(input: ComponentMeasureInput<TextAreaModel>): Generator<number, Measurement> {
  const document = (yield* textAreaDisplayDocumentWork(input.model, input.widthProfile)).document;
  const count = textDocumentLineCount(document);
  const prefix = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, count);
  const width = Math.max(0, input.constraints.width - prefix);
  const layout = yield* layoutTextAreaDocumentWork(document, width, input.model.wrap, input.widthProfile, input.textPresentation);
  return {
    minWidth: prefix,
    minHeight: 1,
    preferredWidth: layout.intrinsicColumns + prefix,
    preferredHeight: layout.contentRows + Number(input.model.error !== ''),
  };
}

export function textAreaLayoutPending(input: ComponentInput<TextAreaModel>): boolean {
  return input.model.preparedLayout !== undefined && preparedTextAreaGeometry(input) === undefined;
}


const geometryCache = new WeakMap<TextAreaModel, { readonly input: ComponentInput<TextAreaModel>; readonly geometry: TextAreaGeometry }>();
const rowMapCache = new WeakMap<TextAreaGeometry, TextAreaLayoutSnapshot['rowOffsetMap']>();

export function textAreaGeometry(input: ComponentInput<TextAreaModel>): TextAreaGeometry {
  const cached = geometryCache.get(input.model);
  if (cached?.input.bounds.width === input.bounds.width
    && cached.input.bounds.height === input.bounds.height && cached.input.theme === input.theme
    && cached.input.widthProfile === input.widthProfile
    && cached.input.textPresentation === input.textPresentation) return cached.geometry;
  const prepared = input.model.preparedLayout === undefined ? undefined : preparedTextAreaGeometry(input);
  if (input.model.preparedLayout !== undefined && prepared === undefined) {
    throw new TypeError('textArea layout is pending.');
  }
  const geometry = prepared === undefined ? finishWork(textAreaGeometryWork(input))
    : completeTextAreaGeometry(input, prepared.geometry, textAreaScrollbar(input, prepared.geometry.layout, prepared.geometry.prefixWidth));
  if (prepared?.rowOffsetMap !== undefined) rowMapCache.set(geometry, prepared.rowOffsetMap);
  geometryCache.set(input.model, { input, geometry });
  return geometry;
}

export function* textAreaGeometryWork(input: ComponentInput<TextAreaModel>): Generator<number, TextAreaGeometry> {
  const display = yield* textAreaDisplayDocumentWork(input.model, input.widthProfile);
  const lineCount = textDocumentLineCount(display.document);
  const prefixWidth = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, lineCount);
  let frameWidth = Math.max(0, input.bounds.width - prefixWidth);
  let layout = yield* layoutTextAreaDocumentWork(
    display.document,
    frameWidth,
    input.model.wrap,
    input.widthProfile,
    input.textPresentation,
  );
  const measurement: Measurement = {
    minWidth: prefixWidth, minHeight: 1, preferredWidth: layout.intrinsicColumns + prefixWidth,
    preferredHeight: layout.contentRows + Number(input.model.error !== ''),
  };
  let scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  if (scrollbar.contentBounds.width !== frameWidth) {
    frameWidth = scrollbar.contentBounds.width;
    layout = yield* layoutTextAreaDocumentWork(
      display.document,
      frameWidth,
      input.model.wrap,
      input.widthProfile,
      input.textPresentation,
    );
    scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  }
  const errorIndex = yield* textAreaErrorIndexWork(input);
  return completeTextAreaGeometry(input, { ...display, lineCount, prefixWidth, layout, measurement,
    ...(errorIndex === undefined ? {} : { errorIndex }) }, scrollbar);
}

function* textAreaErrorIndexWork(input: ComponentInput<TextAreaModel>): Generator<number, import('../../text/types.ts').TerminalTextIndex | undefined> {
  if (input.model.error === '') return undefined;
  const clean = (yield* sanitizeTerminalCellTextWork(input.model.error, { widthProfile: input.widthProfile })).text;
  const source = sourceBoundaries(clean);
  yield* sourceGeometry(source, { widthProfile: input.widthProfile }).prepareOffsetWork(clean.length);
  const index = ownedTerminalTextIndex(source, { widthProfile: input.widthProfile,
    ...(input.textPresentation === undefined ? {} : { textPresentation: input.textPresentation }) });
  if (input.textPresentation !== undefined) yield* index.prepareVisualWork();
  return index;
}

function completeTextAreaGeometry(
  input: ComponentInput<TextAreaModel>,
  base: Omit<TextAreaGeometry, 'scrollbar'>,
  initialScrollbar: ReturnType<typeof textAreaScrollbar>,
): TextAreaGeometry {
  let scrollbar = initialScrollbar;
  if (input.model.revealCaret && input.model.scroll !== undefined) {
    const displayCaret = projectedCaret(base.projection, input.model.caret);
    const caret = base.layout.cursorAt(displayCaret.position.offset, displayCaret.position.affinity);
    const revealed = textAreaCaretScroll(scrollbar, caret.rowIndex, caret.columnCells);
    if (revealed !== scrollbar.scroll) scrollbar = textAreaScrollbar(input, base.layout, base.prefixWidth, revealed);
  }
  return { ...base, scrollbar };
}

/** Prepare observation offsets without materializing every visual row's text index. */
export function* textAreaRowOffsetMapWork(geometry: TextAreaGeometry): Generator<number, TextAreaLayoutSnapshot['rowOffsetMap']> {
  const existing = rowMapCache.get(geometry);
  if (existing !== undefined) return existing;
  const offsets: number[] = [];
  if (geometry.usesPlaceholder) offsets.push(0);
  else {
    const rowStarts = yield* geometry.layout.rowStartOffsetsWork();
    for (const offset of rowStarts) {
      offsets.push(geometry.projection.sourceOffsetAtDisplayOffset(offset, 'upstream'));
      yield 1;
    }
  }
  const map = yield* createRowOffsetMapWork(offsets);
  rowMapCache.set(geometry, map);
  return map;
}

export function textAreaEditorHeight(model: TextAreaModel, height: number): number {
  return Math.max(0, height - Number(model.error !== '' && height > 1));
}

interface TextAreaDisplayDocument {
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
}
const displayCache = new WeakMap<TextAreaModel, { readonly key: string; readonly display: TextAreaDisplayDocument }>();

function* textAreaDisplayDocumentWork(model: TextAreaModel, widthProfile: TextWidthProfile): Generator<number, TextAreaDisplayDocument> {
  const key = textWidthProfileKey(widthProfile);
  const cached = displayCache.get(model);
  if (cached?.key === key) return cached.display;
  const usesPlaceholder = textDocumentLength(model.document) === 0 && model.placeholder !== '';
  const source = usesPlaceholder ? yield* createTextDocumentWork(model.placeholder) : model.document;
  const projection = yield* createTextAreaProjectionWork(
    source,
    usesPlaceholder
      ? readTextAreaDecorations(emptyTextAreaDecorations(source)).decorations
      : readTextAreaDecorations(model.decorations).decorations,
    widthProfile
  );
  const display = { document: projection.document, projection, usesPlaceholder };
  displayCache.set(model, { key, display });
  return display;
}

export function projectedCaret(projection: TextAreaProjection, caret: TextCaret): TextCaret {
  return {
    ...caret,
    position: {
      ...caret.position,
      offset: projection.displayOffsetAtSourceOffset(
        caret.position.offset,
        caret.position.affinity === 'upstream' ? 'upstream' : 'downstream'
      )
    }
  };
}

function textAreaScrollbar(
  input: ComponentInput<TextAreaModel>,
  layout: TextAreaDocumentLayout,
  prefixWidth: number,
  scroll: ScrollState | undefined = input.model.scroll,
) {
  return layoutComponentScrollbar({
    bounds: {
      row: input.bounds.row,
      column: input.bounds.column + prefixWidth,
      width: Math.max(0, input.bounds.width - prefixWidth),
      height: textAreaEditorHeight(input.model, input.bounds.height),
    },
    scroll: {
      offsetRow: scroll?.offsetRow ?? 0,
      offsetColumn: scroll?.offsetColumn ?? 0,
      followTail: scroll?.followTail ?? false,
    },
    contentRows: layout.contentRows,
    contentColumns: layout.contentColumns,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'both',
  });
}

function textAreaCaretScroll(
  scrollbar: ReturnType<typeof layoutComponentScrollbar>,
  row: number,
  column: number,
): ScrollState {
  let scroll = scrollReducer(scrollbar.scroll, {
    kind: 'itemIntoView',
    itemIndex: row,
    alignment: 'nearest',
  }, scrollbar.geometry);
  const viewportColumns = scrollbar.geometry.viewportColumns;
  const offsetColumn = column < scroll.offsetColumn
    ? column
    : column >= scroll.offsetColumn + viewportColumns
      ? column - viewportColumns + 1
      : scroll.offsetColumn;
  if (offsetColumn !== scroll.offsetColumn) {
    scroll = scrollReducer(scroll, {
      kind: 'setOffset',
      columns: offsetColumn,
    }, scrollbar.geometry);
  }
  return scroll;
}

export function textAreaPrefixWidth(
  model: Pick<TextAreaModel, 'lineNumbers'>,
  theme: ComponentInput<TextAreaModel>['theme'],
  widthProfile: TextWidthProfile,
  lineCount: number,
): number {
  const numbers = model.lineNumbers;
  if (numbers === undefined) {
    return measureTextCells(`${theme.tokens.symbols.borderSingle.vertical} `, { widthProfile })
      .cells;
  }
  const width = Math.max(
    numbers.minWidth,
    String(numbers.startNumber + Math.max(0, lineCount - 1)).length,
  );
  return 1 + width +
    measureTextCells(` ${theme.tokens.symbols.borderSingle.vertical} `, { widthProfile }).cells;
}

/** Uses the exact geometry already consulted by painting and interaction. */
export function textAreaCommittedLayout(input: ComponentLayoutCommitInput<TextAreaModel>): TextAreaLayoutSnapshot | undefined {
  if (!input.model.observeLayout || textAreaLayoutPending(input)) return undefined;
  const geometry = textAreaGeometry(input);
  const previous = input.previous;
  if (previous !== undefined && previous.model.observeLayout && !textAreaLayoutPending(previous) && previous.model.document === input.model.document
    && previous.model.decorations === input.model.decorations && previous.theme === input.theme
    && previous.widthProfile === input.widthProfile && previous.textPresentation === input.textPresentation && sameRect(previous.allocatedBounds, input.allocatedBounds)) {
    const before = textAreaGeometry(previous);
    if (before.layout === geometry.layout && sameRect(before.scrollbar.contentBounds, geometry.scrollbar.contentBounds)
      && before.scrollbar.scroll.offsetRow === geometry.scrollbar.scroll.offsetRow
      && before.scrollbar.scroll.offsetColumn === geometry.scrollbar.scroll.offsetColumn
      && before.scrollbar.scroll.followTail === geometry.scrollbar.scroll.followTail) return undefined;
  }
  let rowOffsetMap = rowMapCache.get(geometry);
  rowOffsetMap ??= finishWork(textAreaRowOffsetMapWork(geometry));
  const content = geometry.scrollbar.contentBounds;
  return Object.freeze({
    document: input.model.document,
    layoutRevision: input.commitId,
    allocatedBounds: Object.freeze({ ...input.allocatedBounds }),
    contentBounds: Object.freeze({ ...content, row: content.row + input.allocatedBounds.row, column: content.column + input.allocatedBounds.column }),
    rowOffsetMap,
    scroll: Object.freeze({ ...geometry.scrollbar.scroll }),
  });
}

function sameRect(left: import('../../geometry/types.ts').Rect, right: import('../../geometry/types.ts').Rect): boolean {
  return left.row === right.row && left.column === right.column && left.width === right.width && left.height === right.height;
}
