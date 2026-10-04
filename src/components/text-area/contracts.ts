import type { TextDocument } from '../../text/document.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
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

declare const preparedTextAreaLayoutBrand: unique symbol;

/** Opaque, completed layout for one document and actual component allocation.
 * Admit through the application's ordinary update messages before rendering. */
export interface PreparedTextAreaLayout {
  readonly [preparedTextAreaLayoutBrand]: true;
  readonly document: TextDocument;
  readonly width: number;
  readonly height: number;
  readonly wrap: boolean;
  readonly widthProfile: TextWidthProfile;
  readonly textPresentation?: import('../../text/presentation.ts').TextPresentation;
  readonly theme: TerminalTheme;
}

declare const textAreaLayoutRequestBrand: unique symbol;

/** Actual measurement queries and allocation from an accepted pending frame.
 * Prepare this opaque request in an application effect, then admit its result. */
export interface TextAreaLayoutRequest {
  readonly [textAreaLayoutRequestBrand]: true;
  readonly document: TextDocument;
  readonly layoutRevision: string;
  readonly width: number;
  readonly height: number;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly textPresentation?: import('../../text/presentation.ts').TextPresentation;
  readonly measurementWidths: readonly number[];
}
