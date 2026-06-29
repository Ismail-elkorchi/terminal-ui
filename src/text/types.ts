export interface GraphemeSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
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

export interface TextMeasurementOptions {
  readonly emojiWidth?: 'narrow' | 'wide';
}

export interface TextClipOptions extends TextMeasurementOptions {
  readonly ellipsis?: string;
}

export interface TextWrapOptions extends TextMeasurementOptions {
  readonly preserveWords?: boolean;
}

export interface TextSelection {
  readonly start: number;
  readonly end: number;
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
  wordSelectionAt(offset: number): TextSelection;
  lineSelectionAt(offset: number): TextSelection;
  selectedText(selection: TextSelection): string;
}

export interface TextEditBuffer {
  readonly text: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
}

export type TextAreaEditBuffer = TextEditBuffer;

export type TextEditOperation =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'moveLeft' }
  | { readonly kind: 'moveRight' }
  | { readonly kind: 'moveHome' }
  | { readonly kind: 'moveEnd' }
  | { readonly kind: 'replaceSelection'; readonly text: string };

export type TextAreaEditOperation =
  | TextEditOperation
  | { readonly kind: 'moveLineStart' }
  | { readonly kind: 'moveLineEnd' };

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
  readonly index: number;
  readonly kind: 'escape' | 'control';
}
