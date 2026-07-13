import type { RenderSpan, TerminalStyle } from './render.ts';

export type BorderKind =
  | 'none'
  | 'single'
  | 'double'
  | 'rounded'
  | 'heavy'
  | 'ascii'
  | 'dashed'
  | 'dotted'
  | 'empty';

export type BorderTitleContent = string | readonly RenderSpan[];

export interface BorderTitleRail {
  readonly start?: BorderTitleContent;
  readonly center?: BorderTitleContent;
  readonly end?: BorderTitleContent;
}

export type BorderTitle = BorderTitleContent | BorderTitleRail;

export interface BorderStyle {
  readonly kind: BorderKind;
  readonly title?: BorderTitle;
  readonly titleAlign?: 'start' | 'center' | 'end';
  readonly style?: TerminalStyle;
  readonly focusStyle?: TerminalStyle;
}
