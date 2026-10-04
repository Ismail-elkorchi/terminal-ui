export interface GraphemeSegment {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly cells: number;
}

export interface TextCellMetrics {
  readonly text: string;
  readonly graphemes: readonly GraphemeSegment[];
  readonly cells: number;
  readonly codeUnits: number;
  readonly hasControlSequences: boolean;
}

export interface TextLine {
  readonly text: string;
  readonly cells: number;
  readonly hardBreak: boolean;
}

export interface TextWidthProfile {
  /** Joined emoji width, or scalar widths for terminals that render sequences separately. */
  readonly emoji: 'narrow' | 'wide' | 'codepoint';
  readonly ambiguous: 'narrow' | 'wide';
}

export interface TextMeasurementOptions {
  readonly textPresentation?: TextPresentation | undefined;
  readonly widthProfile?: TextWidthProfile;
}

export interface TextBoundaryOptions {
  readonly locale?: string;
}

export interface TextIndexOptions extends TextMeasurementOptions, TextBoundaryOptions {
  readonly paragraph?: TextParagraphContext;
}

export interface TextClipOptions extends TextMeasurementOptions {
  readonly ellipsis?: string;
}

export interface TextWrapOptions extends TextMeasurementOptions {
  readonly preserveWords?: boolean;
}

export interface TextSelection {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
}

export interface TextDocumentChange {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly insertedText: string;
}

export interface TextChangeSet {
  readonly changes: readonly TextDocumentChange[];
}

export interface RowOffsetMap {
  readonly rowCount: number;
  sourceOffsetAtRow(row: number): number;
  rowAtSourceOffset(offset: number): number;
}

export type TextAffinity = 'upstream' | 'downstream';

export interface TextPosition {
  readonly offset: number;
  readonly affinity: TextAffinity;
}

export interface TextCaret {
  readonly position: TextPosition;
  readonly preferredColumnCells?: number;
}

export interface TextDocumentSelection {
  readonly anchor: TextPosition;
  readonly focus: TextPosition;
}

export interface TerminalTextIndex {
  readonly text: string;
  readonly graphemes: readonly GraphemeSegment[];
  readonly cells: number;
  readonly codeUnits: number;
  readonly bytes: number;
  readonly visualGraphemes: readonly VisualGraphemeSegment[];
  prepareVisualWork(): Generator<number, void>;
  visualGraphemesInColumns(start: number, end: number): readonly VisualGraphemeSegment[];
  positionToVisualColumn(position: TextPosition): number;
  visualColumnToPosition(column: number): TextPosition;
  moveVisualPosition(position: TextPosition, delta: -1 | 1): TextPosition;
  moveVisualWordPosition(position: TextPosition, delta: -1 | 1): TextPosition;
  graphemeIndexToCodeUnitOffset(index: number): number;
  codeUnitOffsetToGraphemeIndex(offset: number): number;
  graphemeIndexToVisualColumn(index: number): number;
  visualColumnToGraphemeIndex(column: number): number;
  graphemeIndexToByteOffset(index: number): number;
  byteOffsetToGraphemeIndex(offset: number): number;
  previousWordBoundary(offset: number): number;
  nextWordBoundary(offset: number): number;
  wordSelectionAt(offset: number): TextSelection;
  lineSelectionAt(offset: number): TextSelection;
  selectedText(selection: TextSelection): string;
}

export interface TextEditBuffer {
  readonly text: string;
  readonly cursor: number;
  readonly affinity?: TextAffinity;
  readonly selection?: TextSelection;
}

export type TextEditOperation =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'replaceRange'; readonly range: TextSelection; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'deleteWordBackward' }
  | { readonly kind: 'deleteWordForward' }
  | { readonly kind: 'moveLeft'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveRight'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveWordLeft'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveWordRight'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveHome'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveEnd'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveDocumentStart'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveDocumentEnd'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveTo'; readonly caret: TextCaret; readonly extendSelection?: boolean }
  | { readonly kind: 'moveLineUp'; readonly extendSelection?: boolean }
  | { readonly kind: 'moveLineDown'; readonly extendSelection?: boolean }
  | { readonly kind: 'selectAll' }
  | { readonly kind: 'replaceSelection'; readonly text: string };

export interface TextClipResult {
  readonly text: string;
  readonly cells: number;
  readonly clipped: boolean;
}

export interface SanitizeTerminalTextOptions extends TextMeasurementOptions {
  readonly replacement?: string;
}

export interface SanitizedTerminalText {
  readonly text: string;
  readonly changed: boolean;
  readonly removedControlSequences: readonly RemovedControlSequence[];
}

export interface RemovedControlSequence {
  readonly sequence: string;
  readonly codeUnitOffset: number;
  readonly kind: 'escape' | 'control';
}

/** A paragraph-aware Unicode bidi implementation supplied once by the session. */
export interface TextPresentation {
  readonly map: TextVisualOrderProvider;
}

export interface TextVisualOrderRequest {
  /** Complete logical paragraph, including context outside the requested wrapped line. */
  readonly text: string;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly widthProfile: TextWidthProfile;
  readonly graphemes: readonly GraphemeSegment[];
}

export interface TextVisualCluster {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  /** One printable grapheme. Mirroring may change its glyph, never its cell width. */
  readonly text: string;
  readonly direction: 'ltr' | 'rtl';
}

export type TextVisualOrderProvider = (request: TextVisualOrderRequest) => readonly TextVisualCluster[];

export interface VisualGraphemeSegment extends GraphemeSegment {
  readonly direction: 'ltr' | 'rtl';
  readonly column: number;
  readonly endColumnExclusive: number;
}

export interface TextParagraphContext {
  readonly text: string;
  /** Start of this index's logical text in the complete paragraph. */
  readonly startOffset: number;
}
