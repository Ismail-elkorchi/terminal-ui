import { sanitizeTerminalText } from '../text/index.ts';
import {
  inlineContentAccessibleText,
  normalizeInlineContent,
  type InlineContent
} from './inline-content.ts';

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

export type BorderTitleContent = string | InlineContent;

export interface BorderTitleRail {
  readonly start?: BorderTitleContent;
  readonly center?: BorderTitleContent;
  readonly end?: BorderTitleContent;
}

export type BorderTitle = BorderTitleContent | BorderTitleRail;

export interface BorderOptions {
  readonly kind: BorderKind;
  readonly titleAlign?: 'start' | 'center' | 'end';
}

export function normalizeBorderTitle(title: BorderTitle): BorderTitle {
  if (typeof title === 'string') return sanitizeTerminalText(title).text;
  if (!isBorderTitleRail(title)) return normalizeInlineContent(title);
  return Object.freeze({
    ...(title.start === undefined ? {} : { start: normalizeBorderTitleContent(title.start) }),
    ...(title.center === undefined ? {} : { center: normalizeBorderTitleContent(title.center) }),
    ...(title.end === undefined ? {} : { end: normalizeBorderTitleContent(title.end) })
  });
}

export function borderTitleAccessibleText(title: BorderTitle | undefined): string {
  if (title === undefined) return '';
  if (typeof title === 'string') return sanitizeTerminalText(title).text;
  if (!isBorderTitleRail(title)) return sanitizeTerminalText(inlineContentAccessibleText(title)).text;
  return [title.start, title.center, title.end]
    .filter((content): content is BorderTitleContent => content !== undefined)
    .map((content) => typeof content === 'string'
      ? sanitizeTerminalText(content).text
      : sanitizeTerminalText(inlineContentAccessibleText(content)).text)
    .filter((content) => content.length > 0)
    .join(' ');
}

function normalizeBorderTitleContent(content: BorderTitleContent): BorderTitleContent {
  return typeof content === 'string'
    ? sanitizeTerminalText(content).text
    : normalizeInlineContent(content);
}

function isBorderTitleRail(title: Exclude<BorderTitle, string>): title is BorderTitleRail {
  return !Array.isArray(title);
}
