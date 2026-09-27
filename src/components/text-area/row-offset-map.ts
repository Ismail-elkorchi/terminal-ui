import {
  decodeComponentScrollbarOptions,
  layoutComponentScrollbar,
} from '../../component/scrollbar.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextDocument } from '../../text/document.ts';
import { assertTextDocument, textDocumentLineCount } from '../../text/document.ts';
import { createRowOffsetMap } from '../../text/row-offset-map.ts';
import type { RowOffsetMap, TextWidthProfile } from '../../text/types.ts';
import { defaultTextWidthProfile } from '../../text/width-profile.ts';
import { defaultTheme } from '../../theme/index.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type { TextAreaLineNumberOptions, TextAreaWrapOptions } from './contracts.ts';
import { readTextAreaDecorations, type TextAreaDecorations } from './decorations.ts';
import { textAreaPrefixWidth } from './geometry.ts';
import { layoutTextAreaDocument } from './layout.ts';
import { decodeLineNumbers, decodeWrap, textAreaDecorationsForDocument } from './model.ts';
import { createTextAreaProjection } from './projection.ts';

export interface TextAreaRowOffsetMapOptions {
  readonly document: TextDocument;
  readonly terminalWidth: number;
  readonly terminalRows: number;
  readonly decorations?: TextAreaDecorations;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly scrollbar?: ScrollbarOptions;
  readonly widthProfile?: TextWidthProfile;
  readonly theme?: TerminalTheme;
}

export function createTextAreaRowOffsetMap(
  options: TextAreaRowOffsetMapOptions
): RowOffsetMap {
  if (!isNonArrayObject(options)) {
    throw new TypeError('Text area row-offset map options must be an object.');
  }
  assertTextDocument(options.document);
  const terminalWidth = layoutDimension(options.terminalWidth, 'terminalWidth');
  const terminalRows = layoutDimension(options.terminalRows, 'terminalRows');
  const widthProfile = options.widthProfile ?? defaultTextWidthProfile;
  const theme = options.theme ?? defaultTheme;
  const lineNumbers = decodeLineNumbers(options.lineNumbers);
  const wrap = decodeWrap(options.wrap);
  const decorations = textAreaDecorationsForDocument(options.decorations, options.document);
  const projection = createTextAreaProjection(
    options.document,
    readTextAreaDecorations(decorations).decorations,
    widthProfile,
  );
  const lineCount = textDocumentLineCount(projection.document);
  const prefixWidth = textAreaPrefixWidth(
    lineNumbers === undefined ? {} : { lineNumbers },
    theme,
    widthProfile,
    lineCount
  );
  let contentWidth = Math.max(0, terminalWidth - prefixWidth);
  let layout = layoutTextAreaDocument(projection.document, contentWidth, wrap, widthProfile);
  const scrollbarOptions = decodeComponentScrollbarOptions(
    options.scrollbar,
    'textArea row-offset map scrollbar'
  );
  const plan = layoutComponentScrollbar({
    bounds: {
      row: 0,
      column: prefixWidth,
      width: contentWidth,
      height: terminalRows
    },
    scroll: { offsetRow: 0, offsetColumn: 0, followTail: false },
    contentRows: layout.contentRows,
    contentColumns: layout.contentColumns,
    ...(scrollbarOptions === undefined ? {} : { options: scrollbarOptions }),
    defaultAxis: 'both'
  });
  if (plan.contentBounds.width !== contentWidth) {
    contentWidth = plan.contentBounds.width;
    layout = layoutTextAreaDocument(projection.document, contentWidth, wrap, widthProfile);
  }
  return createRowOffsetMap(layout.allRowStartOffsets().map((displayOffset) => (
    projection.sourceOffsetAtDisplayOffset(displayOffset, 'upstream')
  )));
}

function layoutDimension(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Text area row-offset map ${field} must be a non-negative finite number.`);
  }
  return Math.floor(value);
}
