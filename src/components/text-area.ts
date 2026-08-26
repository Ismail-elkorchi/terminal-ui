import type { TerminalStyle } from '../visual/render-content.ts';

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
