import { sanitizeTerminalCellText } from '../../text/index.ts';
import { defaultTheme, defineTheme, isTerminalTheme, resolveTerminalStyle } from '../../theme/index.ts';
import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { TerminalSerializationPolicy } from './serialization-policy.ts';
import type { RenderSpan, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import { normalizeTerminalLink, sameTerminalLink, sameTerminalStyle } from '../../visual/render.ts';

export interface RenderSerializeOptions {
  readonly capabilities: TerminalOutputCapabilityProfile;
  readonly theme?: TerminalTheme | TerminalThemeDefinition;
  readonly forceColor?: boolean;
  readonly hyperlinks?: boolean;
}

export interface AnsiStyleState {
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
}

export interface SerializedRenderSpans {
  readonly text: string;
  readonly usesStyle: boolean;
  readonly usesHyperlink: boolean;
}

export function serializeRenderSpans(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): string {
  return serializeRenderSpansStateful(spans, options);
}

export function serializeRenderSpansStateful(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): string {
  return serializeRenderSpansWithProtocols(spans, options).text;
}

export function serializeRenderSpansWithProtocols(
  spans: readonly RenderSpan[],
  options?: RenderSerializeOptions
): SerializedRenderSpans {
  let output = '';
  let state: AnsiStyleState = {};
  let usesStyle = false;
  let usesHyperlink = false;
  const policy = createTerminalSerializationPolicy(options);
  for (const currentSpan of spans) {
    const text = sanitizeTerminalCellText(currentSpan.text).text;
    if (text.length === 0) continue;
    const nextLink = effectiveLink(currentSpan, options);
    const nextStyle = policy.effectiveStyle(resolvedStyle(currentSpan.style, options));
    if (nextLink !== undefined) usesHyperlink = true;
    if (nextStyle !== undefined) usesStyle = true;
    if (!sameTerminalLink(state.link, nextLink)) {
      output += closeLink(state, policy);
      output += openLink(nextLink, policy);
      state = nextLink === undefined ? withoutLink(state) : { ...state, link: nextLink };
    }
    if (!sameTerminalStyle(state.style, nextStyle)) {
      const transition = policy.styleTransition(state.style, nextStyle);
      output += transition;
      state = nextStyle === undefined ? withoutStyle(state) : { ...state, style: nextStyle };
    }
    output += text;
  }
  output += closeStyle(state, policy);
  output += closeLink(state, policy);
  return Object.freeze({ text: output, usesStyle, usesHyperlink });
}

function resolvedStyle(style: TerminalStyle | undefined, options: RenderSerializeOptions | undefined): TerminalStyle | undefined {
  const theme = themeForOptions(options);
  return resolveTerminalStyle(style, theme);
}

function themeForOptions(options: RenderSerializeOptions | undefined): TerminalTheme {
  const theme = options?.theme;
  if (theme === undefined) return defaultTheme;
  return isTerminalTheme(theme) ? theme : defineTheme(theme);
}

function closeStyle(state: AnsiStyleState, policy: TerminalSerializationPolicy): string {
  return state.style === undefined ? '' : policy.resetStyle();
}

function withoutStyle(state: AnsiStyleState): AnsiStyleState {
  return state.link === undefined ? {} : { link: state.link };
}

function withoutLink(state: AnsiStyleState): AnsiStyleState {
  return state.style === undefined ? {} : { style: state.style };
}

function effectiveLink(span: RenderSpan, options: RenderSerializeOptions | undefined): TerminalLink | undefined {
  if (span.link === undefined) return undefined;
  if (
    options?.hyperlinks !== true
    || options.capabilities.hyperlinks.support !== 'supported'
    || options.capabilities.hyperlinks.availability !== 'available'
  ) return undefined;
  return normalizeTerminalLink(span.link);
}

function openLink(link: TerminalLink | undefined, policy: TerminalSerializationPolicy): string {
  if (link === undefined) return '';
  return policy.openHyperlink(link);
}

function closeLink(state: AnsiStyleState, policy: TerminalSerializationPolicy): string {
  return state.link === undefined ? '' : policy.closeHyperlink();
}
