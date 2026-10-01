import type { TerminalStyle } from '../../visual/render-content.ts';

interface TextAreaDecorationBase {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly label?: string;
  readonly style?: TerminalStyle;
}

export interface TextAreaStyleDecoration extends TextAreaDecorationBase {
  readonly kind: 'style';
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

export interface TextAreaReplacementDecoration extends TextAreaDecorationBase {
  readonly kind: 'replace';
  readonly replacementText: string;
  readonly accessibilityText?: string;
}

export interface TextAreaConcealDecoration extends Omit<TextAreaDecorationBase, 'style'> {
  readonly kind: 'conceal';
  readonly style?: never;
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

export type TextAreaDecoration =
  | TextAreaStyleDecoration
  | TextAreaReplacementDecoration
  | TextAreaConcealDecoration;

export interface TextAreaWrapOptions {
  readonly mode?: 'none' | 'soft';
}

export interface TextAreaLineNumberOptions {
  readonly startNumber?: number;
  readonly minWidth?: number;
}

/** Source-exact geometry from an accepted frame. Rectangles use terminal coordinates. */
export interface TextAreaLayoutSnapshot {
  readonly document: import('../../text/document.ts').TextDocument;
  readonly layoutRevision: string;
  readonly allocatedBounds: import('../../geometry/types.ts').Rect;
  readonly contentBounds: import('../../geometry/types.ts').Rect;
  readonly rowOffsetMap: import('../../text/types.ts').RowOffsetMap;
  readonly scroll: import('../../interaction/scroll.ts').ScrollState;
}
