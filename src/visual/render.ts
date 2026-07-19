import { clipTextCells, fillTextCells, measureTextCells } from '../text/index.ts';
import type { ThemeColorToken } from './color.ts';
import { sameFrameCellSource } from './source.ts';
import type { FrameCellSource } from './source.ts';
import type { TextMeasurementOptions } from '../text/index.ts';

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
  | { readonly kind: 'theme'; readonly token: ThemeColorToken };

export interface TerminalLink {
  readonly href: string;
  readonly id?: string;
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

export type RenderAlignment = 'start' | 'center' | 'end';

export interface RenderBlockSize {
  readonly width: number;
  readonly height: number;
}

export interface PadRenderLineOptions extends TextMeasurementOptions {
  readonly align?: RenderAlignment;
  readonly fill?: RenderSpan;
}

export type RenderClipMode = 'end' | 'middle';

export interface ClipRenderSpansOptions extends TextMeasurementOptions {
  readonly ellipsis?: string;
  readonly mode?: RenderClipMode;
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
  options: ClipRenderSpansOptions = {}
): readonly RenderSpan[] {
  if (maxCells < 0) throw new RangeError('maxCells must be non-negative.');
  if (maxCells === 0 || spans.length === 0) return [];
  const segments = spans.flatMap((currentSpan) =>
    measureTextCells(currentSpan.text, options).graphemes.map((segment) => ({
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
  const fittedEllipsis = ellipsis.length === 0 ? '' : clipTextCells(ellipsis, maxCells, options).text;
  const ellipsisCells = measureTextCells(fittedEllipsis, options).cells;
  const budget = Math.max(0, maxCells - ellipsisCells);
  if (options.mode === 'middle') {
    return middleClipSegments(segments, budget, fittedEllipsis);
  }
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

export function clipRenderLine(
  renderLine: RenderLine,
  maxCells: number,
  options: ClipRenderSpansOptions = {}
): RenderLine {
  return line(clipRenderSpans(renderLine.spans, maxCells, options));
}

export function measureRenderSpans(spans: readonly RenderSpan[], options: TextMeasurementOptions = {}): number {
  return spans.reduce((sum, currentSpan) => sum + measureTextCells(currentSpan.text, options).cells, 0);
}

export function measureRenderLine(renderLine: RenderLine, options: TextMeasurementOptions = {}): number {
  return measureRenderSpans(renderLine.spans, options);
}

export function measureRenderBlock(renderBlock: RenderBlock, options: TextMeasurementOptions = {}): RenderBlockSize {
  return {
    width: renderBlock.lines.reduce((max, currentLine) => Math.max(max, measureRenderLine(currentLine, options)), 0),
    height: renderBlock.lines.length
  };
}

export function padRenderLine(renderLine: RenderLine, width: number, options: PadRenderLineOptions = {}): RenderLine {
  if (width < 0) throw new RangeError('width must be non-negative.');
  const currentWidth = measureRenderLine(renderLine, options);
  if (currentWidth >= width) return renderLine;
  const missing = width - currentWidth;
  const before = paddingForAlignment(missing, options.align ?? 'start');
  const after = missing - before;
  const fillSpan = options.fill ?? { text: ' ' };
  return line([
    ...repeatFillSpan(fillSpan, before, options),
    ...renderLine.spans,
    ...repeatFillSpan(fillSpan, after, options)
  ]);
}

export function alignRenderLine(
  renderLine: RenderLine,
  width: number,
  align: RenderAlignment,
  options: TextMeasurementOptions = {}
): RenderLine {
  return padRenderLine(clipRenderLine(renderLine, width, options), width, { align, ...options });
}

export function compactRenderSpans(spans: readonly RenderSpan[]): readonly RenderSpan[] {
  return compactSpans(spans.map((currentSpan) => ({ text: currentSpan.text, options: spanOptions(currentSpan) })));
}

export function wrapRenderSpans(
  spans: readonly RenderSpan[],
  width: number,
  options: TextMeasurementOptions = {}
): readonly RenderLine[] {
  if (width <= 0) throw new RangeError('width must be positive.');
  const lines: RenderLine[] = [];
  let current: { readonly text: string; readonly options: Omit<RenderSpan, 'text'>; readonly cells: number }[] = [];
  let usedCells = 0;

  const pushLine = (): void => {
    lines.push(line(compactSpans(current.map((segment) => ({
      text: segment.text,
      options: segment.options
    })))));
    current = [];
    usedCells = 0;
  };

  for (const currentSpan of spans) {
    const spanMetadata = spanOptions(currentSpan);
    for (const segment of measureTextCells(currentSpan.text, options).graphemes) {
      if (segment.text === '\n') {
        pushLine();
        continue;
      }
      if (usedCells > 0 && usedCells + segment.cells > width) {
        pushLine();
      }
      current.push({ text: segment.text, options: spanMetadata, cells: segment.cells });
      usedCells += segment.cells;
    }
  }

  pushLine();
  return Object.freeze(lines);
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

function paddingForAlignment(missing: number, align: RenderAlignment): number {
  switch (align) {
    case 'start':
      return 0;
    case 'center':
      return Math.floor(missing / 2);
    case 'end':
      return missing;
  }
}

function repeatFillSpan(
  fill: RenderSpan,
  cells: number,
  options: TextMeasurementOptions
): readonly RenderSpan[] {
  if (cells === 0) return [];
  const text = fill.text.length === 0 ? ' ' : fill.text;
  return [{ ...fill, text: fillTextCells(text, cells, options) }];
}

function middleClipSegments(
  segments: readonly { readonly text: string; readonly cells: number; readonly options: Omit<RenderSpan, 'text'> }[],
  budget: number,
  fittedEllipsis: string
): readonly RenderSpan[] {
  const prefixBudget = Math.ceil(budget / 2);
  const suffixBudget = Math.floor(budget / 2);
  const prefix: { readonly text: string; readonly options: Omit<RenderSpan, 'text'> }[] = [];
  const suffix: { readonly text: string; readonly options: Omit<RenderSpan, 'text'> }[] = [];
  let prefixCells = 0;
  let suffixCells = 0;
  let prefixEnd = 0;
  let suffixStart = segments.length;

  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    if (current === undefined || prefixCells + current.cells > prefixBudget) break;
    prefix.push({ text: current.text, options: current.options });
    prefixCells += current.cells;
    prefixEnd = index + 1;
  }

  for (let index = segments.length - 1; index >= prefixEnd; index -= 1) {
    const current = segments[index];
    if (current === undefined || suffixCells + current.cells > suffixBudget) break;
    suffix.unshift({ text: current.text, options: current.options });
    suffixCells += current.cells;
    suffixStart = index;
  }

  const ellipsisOptions = segments[prefixEnd]?.options
    ?? segments[suffixStart - 1]?.options
    ?? prefix.at(-1)?.options
    ?? suffix.at(0)?.options
    ?? {};
  return compactSpans([
    ...prefix,
    ...(fittedEllipsis.length === 0 ? [] : [{ text: fittedEllipsis, options: ellipsisOptions }]),
    ...suffix
  ]);
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

export type { FrameCellSource } from './source.ts';
export { sameFrameCellSource } from './source.ts';
