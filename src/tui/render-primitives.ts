import { clipTextCells, measureTextCells } from '../text/index.ts';
import type { ThemeToken } from '../theme/index.ts';
import type { FrameCell } from './frame.ts';

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

export function clipRenderSpans(
  spans: readonly RenderSpan[],
  maxCells: number,
  options: { readonly ellipsis?: string } = {}
): readonly RenderSpan[] {
  if (maxCells < 0) throw new RangeError('maxCells must be non-negative.');
  if (maxCells === 0 || spans.length === 0) return [];
  const segments = spans.flatMap((currentSpan) =>
    measureTextCells(currentSpan.text).graphemes.map((segment) => ({
      text: segment.text,
      cells: segment.cells,
      options: spanOptions(currentSpan)
    }))
  );
  const totalCells = segments.reduce((sum, current) => sum + current.cells, 0);
  if (totalCells <= maxCells) {
    return compactSpans(segments.map((segment) => ({ text: segment.text, options: segment.options })));
  }
  const ellipsis = options.ellipsis ?? '';
  const fittedEllipsis = ellipsis.length === 0 ? '' : clipTextCells(ellipsis, maxCells).text;
  const ellipsisCells = measureTextCells(fittedEllipsis).cells;
  const budget = Math.max(0, maxCells - ellipsisCells);
  const clipped: { readonly text: string; readonly options: Omit<RenderSpan, 'text'> }[] = [];
  let used = 0;
  let ellipsisOptions: Omit<RenderSpan, 'text'> | undefined;
  for (const segment of segments) {
    if (used + segment.cells > budget) {
      ellipsisOptions = clipped.at(-1)?.options ?? segment.options;
      break;
    }
    clipped.push({ text: segment.text, options: segment.options });
    used += segment.cells;
  }
  if (fittedEllipsis.length > 0) {
    clipped.push({ text: fittedEllipsis, options: ellipsisOptions ?? clipped.at(-1)?.options ?? {} });
  }
  return compactSpans(clipped);
}

export function sameTerminalStyle(left: TerminalStyle | undefined, right: TerminalStyle | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return sameTerminalColor(left.fg, right.fg)
    && sameTerminalColor(left.bg, right.bg)
    && flag(left.bold) === flag(right.bold)
    && flag(left.dim) === flag(right.dim)
    && flag(left.italic) === flag(right.italic)
    && flag(left.underline) === flag(right.underline)
    && flag(left.strikethrough) === flag(right.strikethrough)
    && flag(left.inverse) === flag(right.inverse)
    && flag(left.hidden) === flag(right.hidden);
}

export function sameTerminalColor(left: TerminalColor | undefined, right: TerminalColor | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'ansi':
      return right.kind === 'ansi' && left.value === right.value;
    case 'rgb':
      return right.kind === 'rgb' && left.r === right.r && left.g === right.g && left.b === right.b;
    case 'theme':
      return right.kind === 'theme' && left.token === right.token;
  }
}

export function sameTerminalLink(left: TerminalLink | undefined, right: TerminalLink | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.href === right.href && left.id === right.id;
}

export function sameFrameCellSource(left: FrameCellSource | undefined, right: FrameCellSource | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.id === right.id
    && left.kind === right.kind
    && left.role === right.role
    && left.label === right.label;
}

export function sameFrameCell(left: FrameCell | undefined, right: FrameCell | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.text === right.text
    && left.width === right.width
    && flag(left.continuation) === flag(right.continuation)
    && sameTerminalStyle(left.style, right.style)
    && sameTerminalLink(left.link, right.link)
    && sameFrameCellSource(left.source, right.source);
}

function flag(value: boolean | undefined): boolean {
  return value === true;
}

function spanOptions(span: RenderSpan): Omit<RenderSpan, 'text'> {
  return {
    ...(span.style === undefined ? {} : { style: span.style }),
    ...(span.link === undefined ? {} : { link: span.link }),
    ...(span.source === undefined ? {} : { source: span.source })
  };
}

function compactSpans(
  segments: readonly { readonly text: string; readonly options: Omit<RenderSpan, 'text'> }[]
): readonly RenderSpan[] {
  const result: RenderSpan[] = [];
  for (const current of segments) {
    if (current.text.length === 0) continue;
    const previous = result.at(-1);
    if (
      previous !== undefined
      && sameTerminalStyle(previous.style, current.options.style)
      && sameTerminalLink(previous.link, current.options.link)
      && sameFrameCellSource(previous.source, current.options.source)
    ) {
      result[result.length - 1] = { ...previous, text: `${previous.text}${current.text}` };
    } else {
      result.push({ text: current.text, ...current.options });
    }
  }
  return Object.freeze(result);
}
