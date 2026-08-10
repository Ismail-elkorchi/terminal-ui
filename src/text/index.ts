export { clipTextCells } from './clip.ts';
export { fillTextCells, oneCellGlyph, padTextCells } from './cell-geometry.ts';
export { textCaretAt, textDocumentSelectionBetween, textPositionAt } from './coordinates.ts';
export { applyTextEditWithHistory, emptyTextEditHistory } from './edit-history.ts';
export { editTextBuffer } from './edit.ts';
export { editTextDocument } from './document-edit.ts';
export type { TextDocumentEditResult, TextDocumentEditState } from './document-edit.ts';
export {
  assertTextDocument,
  isTextDocument,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelection,
  normalizeTextDocumentSelectionModel,
  normalizeTextCaret,
  normalizeTextPosition,
  prepareTextDocument,
  textDocumentEdit,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentSlice,
  textDocumentSelectionRange,
  textDocumentText
} from './document.ts';
export type { TextDocument, TextDocumentChange, TextDocumentLine } from './document.ts';
export { segmentGraphemes } from './graphemes.ts';
export { measureTextCells } from './measure.ts';
export { sanitizeTerminalCellText, sanitizeTerminalText } from './sanitize.ts';
export { findTextHighlightMatches } from './search-highlight.ts';
export {
  clampTextOffset,
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange,
  selectedText
} from './selection-model.ts';
export { createTerminalTextIndex } from './terminal-text-index.ts';
export { terminalTextWidth } from './terminal-width.ts';
export { extractTextSelection } from './selection.ts';
export {
  lineEndOffset,
  lineOffsetByDelta,
  lineSelectionAt,
  lineStartOffset,
  nextWordBoundary,
  previousWordBoundary,
  wordSelectionAt
} from './word-boundaries.ts';
export { wrapTextCells } from './wrap.ts';
export { defaultTextWidthProfile, defineTextWidthProfile, textWidthProfileKey } from './width-profile.ts';
export type * from './types.ts';
export type { PadTextCellsOptions, TextCellAlignment } from './cell-geometry.ts';
export type {
  TextEditHistory,
  TextEditHistoryGroup,
  TextEditHistoryOperation,
  TextEditHistoryResult
} from './edit-history.ts';
export type { ExtractTextSelectionInput } from './selection.ts';
export type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';
