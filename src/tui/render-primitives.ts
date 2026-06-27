import type { ThemeToken } from '../theme/index.ts';

export interface TerminalStyle {
  readonly fg?: TerminalColor;
  readonly bg?: TerminalColor;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly inverse?: boolean;
  readonly hidden?: boolean;
}

export type TerminalColor =
  | { readonly kind: 'ansi'; readonly value: number }
  | { readonly kind: 'rgb'; readonly r: number; readonly g: number; readonly b: number }
  | { readonly kind: 'theme'; readonly token: ThemeToken };

export interface TerminalLink {
  readonly href: string;
  readonly id?: string;
}

export interface FrameCellSource {
  readonly id?: string;
  readonly kind?: string;
  readonly role?: string;
  readonly label?: string;
}

export interface RenderSpan {
  readonly text: string;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
}

export interface RenderLine {
  readonly spans: readonly RenderSpan[];
}

export interface RenderBlock {
  readonly lines: readonly RenderLine[];
}

export function span(text: string, options: Omit<RenderSpan, 'text'> = {}): RenderSpan {
  return {
    text,
    ...options
  };
}

export function line(spans: readonly RenderSpan[]): RenderLine {
  return { spans: Object.freeze([...spans]) };
}

export function block(lines: readonly RenderLine[]): RenderBlock {
  return { lines: Object.freeze([...lines]) };
}

export function blockFromText(text: string, options: Omit<RenderSpan, 'text'> = {}): RenderBlock {
  return block(text.split('\n').map((part) => line([span(part, options)])));
}
