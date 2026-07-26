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
  readonly emoji: 'narrow' | 'wide';
  readonly ambiguous: 'narrow' | 'wide';
}

export interface TextMeasurementOptions {
  readonly widthProfile?: TextWidthProfile;
}

export interface TextBoundaryOptions {
  readonly locale?: string;
}

export interface TextIndexOptions extends TextMeasurementOptions, TextBoundaryOptions {}

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
  readonly selection?: TextSelection;
}

export type TextEditOperation =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'deleteWordBackward' }
  | { readonly kind: 'deleteWordForward' }
  | { readonly kind: 'moveLeft'; readonly select?: boolean }
  | { readonly kind: 'moveRight'; readonly select?: boolean }
  | { readonly kind: 'moveWordLeft'; readonly select?: boolean }
  | { readonly kind: 'moveWordRight'; readonly select?: boolean }
  | { readonly kind: 'moveHome'; readonly select?: boolean }
  | { readonly kind: 'moveEnd'; readonly select?: boolean }
  | { readonly kind: 'moveLineUp'; readonly select?: boolean }
  | { readonly kind: 'moveLineDown'; readonly select?: boolean }
  | { readonly kind: 'movePageUp'; readonly select?: boolean }
  | { readonly kind: 'movePageDown'; readonly select?: boolean }
  | { readonly kind: 'selectAll' }
  | { readonly kind: 'replaceSelection'; readonly text: string };

export interface TextClipResult {
  readonly text: string;
  readonly cells: number;
  readonly clipped: boolean;
}

export interface SanitizeTerminalTextOptions {
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
