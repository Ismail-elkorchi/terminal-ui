import { createRowOffsetMap } from '../../text/row-offset-map.ts';
import type { ComponentLayoutCommitInput } from '../../component/contracts.ts';
import type { TextAreaLayoutSnapshot } from './contracts.ts';
import { scrollReducer } from '../../behavior/scroll.ts';
import type { ComponentInput, ComponentMeasureInput } from '../../component/contracts.ts';
import { layoutComponentScrollbar } from '../../component/scrollbar.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { Measurement } from '../../renderer/contracts.ts';
import type { TextDocument } from '../../text/document.ts';
import {
  createTextDocument,
  textDocumentLength,
  textDocumentLineCount,
} from '../../text/document.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { TextCaret, TextWidthProfile } from '../../text/types.ts';
import { emptyTextAreaDecorations, readTextAreaDecorations } from './decorations.ts';
import { layoutTextAreaDocument, type TextAreaDocumentLayout } from './layout.ts';
import type { TextAreaModel } from './model.ts';
import { createTextAreaProjection, type TextAreaProjection } from './projection.ts';

export function measureTextArea(input: ComponentMeasureInput<TextAreaModel>): Measurement {
  const document = textAreaDisplayDocument(input.model, input.widthProfile).document;
  const count = textDocumentLineCount(document);
  const prefix = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, count);
  const width = Math.max(0, input.constraints.width - prefix);
  const layout = layoutTextAreaDocument(document, width, input.model.wrap, input.widthProfile);
  return {
    minWidth: prefix,
    minHeight: 1,
    preferredWidth: layout.intrinsicColumns + prefix,
    preferredHeight: layout.contentRows + Number(input.model.error !== ''),
  };
}

export interface TextAreaGeometry {
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
  readonly lineCount: number;
  readonly prefixWidth: number;
  readonly layout: TextAreaDocumentLayout;
  readonly scrollbar: ReturnType<typeof layoutComponentScrollbar>;
}

const geometryCache = new WeakMap<TextAreaModel, { readonly input: ComponentInput<TextAreaModel>; readonly geometry: TextAreaGeometry }>();
const rowMapCache = new WeakMap<TextAreaGeometry, TextAreaLayoutSnapshot['rowOffsetMap']>();

export function textAreaGeometry(input: ComponentInput<TextAreaModel>): TextAreaGeometry {
  const cached = geometryCache.get(input.model);
  if (cached?.input.bounds.width === input.bounds.width
    && cached.input.bounds.height === input.bounds.height && cached.input.theme === input.theme
    && cached.input.widthProfile === input.widthProfile) return cached.geometry;
  const geometry = computeTextAreaGeometry(input);
  geometryCache.set(input.model, { input, geometry });
  return geometry;
}

function computeTextAreaGeometry(input: ComponentInput<TextAreaModel>): TextAreaGeometry {
  const display = textAreaDisplayDocument(input.model, input.widthProfile);
  const lineCount = textDocumentLineCount(display.document);
  const prefixWidth = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, lineCount);
  let frameWidth = Math.max(0, input.bounds.width - prefixWidth);
  let layout = layoutTextAreaDocument(
    display.document,
    frameWidth,
    input.model.wrap,
    input.widthProfile,
  );
  let scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  if (scrollbar.contentBounds.width !== frameWidth) {
    frameWidth = scrollbar.contentBounds.width;
    layout = layoutTextAreaDocument(
      display.document,
      frameWidth,
      input.model.wrap,
      input.widthProfile,
    );
    scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  }
  if (input.model.revealCaret && input.model.scroll !== undefined) {
    const displayCaret = projectedCaret(display.projection, input.model.caret);
    const caret = layout.cursorAt(displayCaret.position.offset, displayCaret.position.affinity);
    const revealed = textAreaCaretScroll(scrollbar, caret.rowIndex, caret.columnCells);
    if (revealed !== scrollbar.scroll) {
      scrollbar = textAreaScrollbar(input, layout, prefixWidth, revealed);
    }
  }
  return {
    document: display.document,
    projection: display.projection,
    usesPlaceholder: display.usesPlaceholder,
    lineCount,
    prefixWidth,
    layout,
    scrollbar,
  };
}

export function textAreaEditorHeight(model: TextAreaModel, height: number): number {
  return Math.max(0, height - Number(model.error !== '' && height > 1));
}

function textAreaDisplayDocument(model: TextAreaModel, widthProfile: TextWidthProfile): {
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
} {
  const usesPlaceholder = textDocumentLength(model.document) === 0 && model.placeholder !== '';
  const source = usesPlaceholder ? createTextDocument(model.placeholder) : model.document;
  const projection = createTextAreaProjection(
    source,
    usesPlaceholder
      ? readTextAreaDecorations(emptyTextAreaDecorations(source)).decorations
      : readTextAreaDecorations(model.decorations).decorations,
    widthProfile
  );
  return {
    document: projection.document,
    projection,
    usesPlaceholder,
  };
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
  if (!input.model.observeLayout) return undefined;
  const geometry = textAreaGeometry(input);
  const previous = input.previous;
  if (previous !== undefined && previous.model.observeLayout && previous.model.document === input.model.document
    && previous.model.decorations === input.model.decorations && previous.theme === input.theme
    && previous.widthProfile === input.widthProfile && sameRect(previous.allocatedBounds, input.allocatedBounds)) {
    const before = textAreaGeometry(previous);
    if (before.layout === geometry.layout && sameRect(before.scrollbar.contentBounds, geometry.scrollbar.contentBounds)
      && before.scrollbar.scroll.offsetRow === geometry.scrollbar.scroll.offsetRow
      && before.scrollbar.scroll.offsetColumn === geometry.scrollbar.scroll.offsetColumn
      && before.scrollbar.scroll.followTail === geometry.scrollbar.scroll.followTail) return undefined;
  }
  let rowOffsetMap = rowMapCache.get(geometry);
  if (rowOffsetMap === undefined) {
    rowOffsetMap = createRowOffsetMap(geometry.usesPlaceholder ? [0] : geometry.layout.allRowStartOffsets().map((offset) =>
      geometry.projection.sourceOffsetAtDisplayOffset(offset, 'upstream')));
    rowMapCache.set(geometry, rowOffsetMap);
  }
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
