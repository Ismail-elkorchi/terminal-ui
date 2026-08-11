import { sanitizeTerminalText } from '../text/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
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

export interface BorderTitleSlots {
  readonly start?: BorderTitleContent;
  readonly center?: BorderTitleContent;
  readonly end?: BorderTitleContent;
}

export type BorderTitle = BorderTitleContent | BorderTitleSlots;

export interface BorderOptions {
  readonly kind: BorderKind;
  readonly titleAlign?: 'start' | 'center' | 'end';
}

const normalizedBorderTitles = new WeakSet<object>();

export function normalizeBorderTitle(title: BorderTitle): BorderTitle {
  if (typeof title === 'string') return sanitizeTerminalText(title).text;
  if (Array.isArray(title)) return normalizeInlineContent(title);
  if (!isNonArrayObject(title)) throw new TypeError('Border title must be a string, inline content, or title slots.');
  if (normalizedBorderTitles.has(title)) return title;
  let start: unknown;
  let center: unknown;
  let end: unknown;
  try {
    start = title['start'];
    center = title['center'];
    end = title['end'];
  } catch (cause) {
    throw new TypeError('Border title slots could not be read.', { cause });
  }
  const normalized = Object.freeze({
    ...(start === undefined ? {} : { start: normalizeBorderTitleContent(start) }),
    ...(center === undefined ? {} : { center: normalizeBorderTitleContent(center) }),
    ...(end === undefined ? {} : { end: normalizeBorderTitleContent(end) })
  });
  normalizedBorderTitles.add(normalized);
  return normalized;
}

export function borderTitleAccessibleText(title: BorderTitle | undefined): string {
  if (title === undefined) return '';
  if (typeof title === 'string') return title;
  if (!isBorderTitleSlots(title)) return inlineContentAccessibleText(title);
  return [title.start, title.center, title.end]
    .filter((content): content is BorderTitleContent => content !== undefined)
    .map((content) => typeof content === 'string'
      ? content
      : inlineContentAccessibleText(content))
    .filter((content) => content.length > 0)
    .join(' ');
}

function normalizeBorderTitleContent(content: unknown): BorderTitleContent {
  return typeof content === 'string'
    ? sanitizeTerminalText(content).text
    : normalizeInlineContent(content as InlineContent);
}

function isBorderTitleSlots(title: Exclude<BorderTitle, string>): title is BorderTitleSlots {
  return !Array.isArray(title);
}
