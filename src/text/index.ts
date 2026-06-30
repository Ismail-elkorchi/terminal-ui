export { clipTextCells } from './clip.ts';
export { applyTextEditWithHistory, emptyTextEditHistory } from './edit-history.ts';
export { editTextBuffer } from './edit.ts';
export { segmentGraphemes } from './graphemes.ts';
export { measureTextCells } from './measure.ts';
export { sanitizeTerminalText } from './sanitize.ts';
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
export { editTextAreaBuffer } from './text-area-edit.ts';
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
export type * from './types.ts';
export type {
  TextEditHistory,
  TextEditHistoryGroup,
  TextEditHistoryOperation,
  TextEditHistoryResult
} from './edit-history.ts';
export type { ExtractTextSelectionInput } from './selection.ts';
export type { TextHighlightMatch, TextHighlightOptions } from './search-highlight.ts';
