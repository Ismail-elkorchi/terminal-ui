import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { normalizeTerminalLink } from './render.ts';
import { normalizeTerminalStyle } from './terminal-style.ts';
import type { TerminalLink, TerminalStyle } from './render.ts';

interface InlineSegmentBase {
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
}

export interface InlineTextSegment extends InlineSegmentBase {
  readonly kind: 'text';
  readonly text: string;
}

export interface InlineSymbolSegment extends InlineSegmentBase {
  readonly kind: 'symbol';
  readonly unicode: string;
  readonly ascii: string;
  readonly accessibleText: string;
}

export type InlineContentSegment = InlineTextSegment | InlineSymbolSegment;
export type InlineContent = readonly InlineContentSegment[];
export type TerminalSymbolMode = 'unicode' | 'ascii';

export function normalizeInlineContent(content: InlineContent): InlineContent {
  const segments: readonly InlineContentSegment[] = content;
  if (!Array.isArray(content)) throw new TypeError('Inline content must be an array.');
  if (normalizedInlineContents.has(content)) return segments;
  const normalized = Object.freeze(segments.map((segment, index) =>
    normalizeInlineSegment(segment, index)));
  normalizedInlineContents.add(normalized);
  return normalized;
}

export function tryNormalizeInlineContent(value: unknown): InlineContent | undefined {
  try {
    return normalizeInlineContent(value as InlineContent);
  } catch {
    return undefined;
  }
}

export function inlineSegmentText(segment: InlineContentSegment, mode: TerminalSymbolMode): string {
  return segment.kind === 'text' ? segment.text : mode === 'unicode' ? segment.unicode : segment.ascii;
}

export function inlineContentAccessibleText(content: InlineContent): string {
  return content.map((segment) => segment.kind === 'text' ? segment.text : segment.accessibleText).join('');
}

const normalizedInlineContents = new WeakSet<InlineContent>();

function normalizeInlineSegment(value: unknown, index: number): InlineContentSegment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Inline content segment ${String(index)} must be an object.`);
  }
  const segment = value as Readonly<Record<string, unknown>>;
  let kind: unknown;
  let style: unknown;
  let link: unknown;
  try {
    kind = segment['kind'];
    style = segment['style'];
    link = segment['link'];
  } catch (cause) {
    throw new TypeError(`Inline content segment ${String(index)} could not be read.`, { cause });
  }
  const decoration = normalizedDecoration(style, link, index);
  if (kind === 'text') {
    let text: unknown;
    try {
      text = segment['text'];
    } catch (cause) {
      throw new TypeError(`Inline text segment ${String(index)} could not be read.`, { cause });
    }
    if (typeof text !== 'string') {
      throw new TypeError(`Inline text segment ${String(index)} requires text.`);
    }
    return Object.freeze({
      kind: 'text',
      text: sanitizeTerminalText(text).text,
      ...decoration
    });
  }
  if (kind !== 'symbol') {
    throw new TypeError(`Inline content segment ${String(index)} kind is invalid.`);
  }
  let unicode: unknown;
  let ascii: unknown;
  let accessibleTextValue: unknown;
  try {
    unicode = segment['unicode'];
    ascii = segment['ascii'];
    accessibleTextValue = segment['accessibleText'];
  } catch (cause) {
    throw new TypeError(`Inline symbol segment ${String(index)} could not be read.`, { cause });
  }
  if (typeof unicode !== 'string' || typeof ascii !== 'string'
    || typeof accessibleTextValue !== 'string') {
    throw new TypeError(`Inline symbol segment ${String(index)} requires unicode, ascii, and accessibleText.`);
  }
  const normalizedUnicode = normalizedSymbol(unicode, 'unicode');
  const normalizedAscii = normalizedSymbol(ascii, 'ascii');
  const accessibleText = sanitizeTerminalText(accessibleTextValue).text.trim();
  if (accessibleText.length === 0) {
    throw new TypeError('Inline symbol segments require non-empty accessibleText.');
  }
  if (!/^[\x20-\x7E]+$/u.test(normalizedAscii)) {
    throw new TypeError('Inline symbol ascii fallbacks must contain printable ASCII only.');
  }
  return Object.freeze({
    kind: 'symbol',
    unicode: normalizedUnicode,
    ascii: normalizedAscii,
    accessibleText,
    ...decoration
  });
}

function normalizedSymbol(value: string, name: string): string {
  const text = sanitizeTerminalText(value).text;
  if (text.includes('\n') || measureTextCells(text).cells === 0) {
    throw new TypeError(`Inline symbol ${name} content must occupy at least one cell on one line.`);
  }
  return text;
}

function normalizedDecoration(
  style: unknown,
  link: unknown,
  index: number
): Pick<InlineSegmentBase, 'style' | 'link'> {
  return {
    ...(style === undefined
      ? {}
      : { style: normalizeTerminalStyle(style, `Inline content segment ${String(index)} style`) }),
    ...(link === undefined ? {} : { link: normalizeTerminalLink(link) })
  };
}
