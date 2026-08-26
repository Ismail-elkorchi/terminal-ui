export { clipTextCells } from './clip.ts';
export { fillTextCells, oneCellGlyph, padTextCells } from './cell-geometry.ts';
export { textCaretAt, textDocumentSelectionBetween, textPositionAt } from './coordinates.ts';
export {
  applyTextEditWithHistory,
  breakTextEditHistoryGroup,
  emptyTextEditHistory
} from './edit-history.ts';
export { defaultEditHistoryPolicy } from './bounded-history.ts';
export {
  applyTextChangeSet,
  createTextChangeSet,
  emptyTextChangeSet,
  invertTextChangeSet
} from './change-set.ts';
export { editTextBuffer } from './edit.ts';
export { editTextDocument } from './document-edit.ts';
export type { TextDocumentEditResult, TextDocumentEditState } from './document-edit.ts';
export {
  assertTextDocument,
  isTextDocument,
  normalizeTextDocumentOffset,
  normalizeTextDocumentRange,
  normalizeTextDocumentSelection,
  normalizeTextCaret,
  normalizeTextPosition,
  createTextDocument,
  textDocumentEdit,
  textDocumentBytes,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentParentChange,
  textDocumentSlice,
  textDocumentSelectionRange,
  textDocumentText
} from './document.ts';
export type { TextDocument, TextDocumentLine, TextDocumentMutation } from './document.ts';
export { segmentGraphemes } from './graphemes.ts';
export { measureTerminalCellText, measureTextCells } from './measure.ts';
export {
  sanitizeTerminalCellText,
  sanitizeTerminalSingleLineText,
  sanitizeTerminalText,
} from './sanitize.ts';
export { findTextHighlightMatches } from './search-highlight.ts';
export {
  compareCollectionText,
  matchCollectionQuery,
  matchCompiledCollectionQuery,
  compileCollectionQuery,
  indexQueryCandidate,
  queryCandidates,
  queryIndexedCandidates,
} from './query.ts';
export type {
  CollectionQuery,
  CompiledCollectionQuery,
  IndexedQueryCandidate,
  QueryCandidate,
  QueryMatch,
  QueryMatchMode,
  QueryMatchRange,
} from './query.ts';
export {
  clampTextOffset,
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange,
  selectedText
} from './text-range.ts';
export { createTerminalTextIndex } from './terminal-text-index.ts';
export { createRowOffsetMap } from './row-offset-map.ts';
export { terminalTextWidth } from './terminal-width.ts';
export {
  extractTextBufferSelection,
  extractTextDocumentSelection,
  extractTextSelection,
} from './selection.ts';
export type {
  ExtractTextBufferSelectionInput,
  ExtractTextDocumentSelectionInput,
  ExtractTextSelectionInput,
} from './selection.ts';
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
export type {
  BoundedEditHistory,
  EditHistoryEntry,
  EditHistoryPolicy,
  EditHistoryTransition
} from './bounded-history.ts';
export type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';
