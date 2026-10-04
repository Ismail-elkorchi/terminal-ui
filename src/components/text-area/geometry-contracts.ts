import type { layoutComponentScrollbar } from '../../component/scrollbar.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { Measurement } from '../../renderer/contracts.ts';
import type { TextDocument } from '../../text/document.ts';
import type { TextAreaDecorations } from './decorations.ts';
import type { TextAreaDocumentLayout } from './layout.ts';
import type { TextAreaProjection } from './projection.ts';

export interface TextAreaLayoutDependencies {
  readonly document: TextDocument;
  readonly decorations: TextAreaDecorations;
  readonly rawPlaceholder: string;
  readonly rawError: string;
  readonly placeholder: string;
  readonly lineNumbers?: { readonly startNumber: number; readonly minWidth: number };
  readonly wrap: boolean;
  readonly error: string;
  readonly scrollbar?: ScrollbarOptions;
}

export interface TextAreaGeometry {
  readonly measurement: Measurement;
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
  readonly lineCount: number;
  readonly prefixWidth: number;
  readonly layout: TextAreaDocumentLayout;
  readonly errorIndex?: import('../../text/types.ts').TerminalTextIndex;
  readonly scrollbar: ReturnType<typeof layoutComponentScrollbar>;
}
