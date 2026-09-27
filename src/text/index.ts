export { defaultEditHistoryPolicy } from './bounded-history.ts';
export type {
  BoundedEditHistory,
  EditHistoryEntry,
  EditHistoryPolicy,
  EditHistoryTransition,
} from './bounded-history.ts';
export { fillTextCells, oneCellGlyph, padTextCells } from './cell-geometry.ts';
export type { PadTextCellsOptions, TextCellAlignment } from './cell-geometry.ts';
export {
  applyTextChangeSet,
  createTextChangeSet,
  emptyTextChangeSet,
  invertTextChangeSet,
} from './change-set.ts';
export { clipTextCells } from './clip.ts';
export { textCaretAt, textDocumentSelectionBetween, textPositionAt } from './coordinates.ts';
export { editTextDocument } from './document-edit.ts';
export type { TextDocumentEditResult, TextDocumentEditState } from './document-edit.ts';
export {
  assertTextDocument,
  createTextDocument,
  isTextDocument,
  normalizeTextCaret,
  normalizeTextDocumentOffset,
  normalizeTextDocumentRange,
  normalizeTextDocumentSelection,
  normalizeTextPosition,
  textDocumentBytes,
  textDocumentEdit,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentLines,
  textDocumentSelectionRange,
  textDocumentSlice,
  textDocumentText,
} from './document.ts';
export type { TextDocument, TextDocumentLine, TextDocumentMutation } from './document.ts';
export {
  applyTextEditWithHistory,
  breakTextEditHistoryGroup,
  emptyTextEditHistory,
} from './edit-history.ts';
export type {
  TextEditHistory,
  TextEditHistoryGroup,
  TextEditHistoryOperation,
  TextEditHistoryResult,
} from './edit-history.ts';
export { editTextBuffer } from './edit.ts';
export { segmentGraphemes } from './graphemes.ts';
export { measureTerminalCellText, measureTextCells } from './measure.ts';
export {
  compareCollectionText,
  compileCollectionQuery,
  indexQueryCandidate,
  matchCollectionQuery,
  matchCompiledCollectionQuery,
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
export { createRowOffsetMap } from './row-offset-map.ts';
export {
  sanitizeTerminalCellText,
  sanitizeTerminalSingleLineText,
  sanitizeTerminalText,
} from './sanitize.ts';
export { findTextHighlightMatches } from './search-highlight.ts';
export type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';
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
export { createTerminalTextIndex } from './terminal-text-index.ts';
export { terminalTextWidth } from './terminal-width.ts';
export {
  clampTextOffset,
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange,
  selectedText,
} from './text-range.ts';
export type {
  GraphemeSegment,
  RemovedControlSequence,
  RowOffsetMap,
  SanitizeTerminalTextOptions,
  SanitizedTerminalText,
  TerminalTextIndex,
  TextAffinity,
  TextBoundaryOptions,
  TextCaret,
  TextCellMetrics,
  TextChangeSet,
  TextClipOptions,
  TextClipResult,
  TextDocumentChange,
  TextDocumentSelection,
  TextEditBuffer,
  TextEditOperation,
  TextIndexOptions,
  TextLine,
  TextMeasurementOptions,
  TextPosition,
  TextSelection,
  TextWidthProfile,
  TextWrapOptions,
} from './types.ts';
export {
  defaultTextWidthProfile,
  defineTextWidthProfile,
  textWidthProfileKey,
} from './width-profile.ts';
export {
  lineEndOffset,
  lineOffsetByDelta,
  lineSelectionAt,
  lineStartOffset,
  nextWordBoundary,
  previousWordBoundary,
  wordSelectionAt,
} from './word-boundaries.ts';
export { wrapTextCells } from './wrap.ts';
