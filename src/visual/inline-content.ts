import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
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
  return Object.freeze(content.map((segment) => normalizeInlineSegment(segment)));
}

export function isInlineContent(value: unknown): value is InlineContent {
  return Array.isArray(value) && value.every((segment) => {
    if (typeof segment !== 'object' || segment === null) return false;
    const candidate = segment as Readonly<Record<string, unknown>>;
    return candidate['kind'] === 'text'
      ? typeof candidate['text'] === 'string'
      : candidate['kind'] === 'symbol'
        && typeof candidate['unicode'] === 'string'
        && typeof candidate['ascii'] === 'string'
        && typeof candidate['accessibleText'] === 'string';
  });
}

export function inlineSegmentText(segment: InlineContentSegment, mode: TerminalSymbolMode): string {
  return segment.kind === 'text' ? segment.text : mode === 'unicode' ? segment.unicode : segment.ascii;
}

export function inlineContentAccessibleText(content: InlineContent): string {
  return content.map((segment) => segment.kind === 'text' ? segment.text : segment.accessibleText).join('');
}

function normalizeInlineSegment(segment: InlineContentSegment): InlineContentSegment {
  if (segment.kind === 'text') {
    return Object.freeze({
      kind: 'text',
      text: sanitizeTerminalText(segment.text).text,
      ...normalizedDecoration(segment)
    });
  }
  const unicode = normalizedSymbol(segment.unicode, 'unicode');
  const ascii = normalizedSymbol(segment.ascii, 'ascii');
  const accessibleText = sanitizeTerminalText(segment.accessibleText).text.trim();
  if (accessibleText.length === 0) {
    throw new TypeError('Inline symbol segments require non-empty accessibleText.');
  }
  if (!/^[\x20-\x7E]+$/u.test(ascii)) {
    throw new TypeError('Inline symbol ascii fallbacks must contain printable ASCII only.');
  }
  return Object.freeze({
    kind: 'symbol',
    unicode,
    ascii,
    accessibleText,
    ...normalizedDecoration(segment)
  });
}

function normalizedSymbol(value: string, name: string): string {
  const text = sanitizeTerminalText(value).text;
  if (text.includes('\n') || measureTextCells(text).cells === 0) {
    throw new TypeError(`Inline symbol ${name} content must occupy at least one cell on one line.`);
  }
  return text;
}

function normalizedDecoration(segment: InlineSegmentBase): Pick<InlineSegmentBase, 'style' | 'link'> {
  return {
    ...(segment.style === undefined ? {} : { style: { ...segment.style } }),
    ...(segment.link === undefined ? {} : {
      link: {
        href: sanitizeTerminalText(segment.link.href).text,
        ...(segment.link.id === undefined ? {} : { id: sanitizeTerminalText(segment.link.id).text })
      }
    })
  };
}
