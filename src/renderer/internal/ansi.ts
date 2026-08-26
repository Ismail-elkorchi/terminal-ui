import { sanitizeTerminalCellText } from '../../text/index.ts';
import { defaultTheme, resolveTerminalStyle } from '../../theme/index.ts';
import { resolveThemeInput } from '../../theme/theme.ts';
import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../../theme/index.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { TerminalSerializationPolicy } from './serialization-policy.ts';
import type { RenderSpan, TerminalLink, TerminalStyle } from '../../visual/render-content.ts';
import { decodeTerminalLink, sameTerminalLink, sameTerminalStyle } from '../../visual/render-content.ts';

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

export interface SerializedRenderSpanChunk extends SerializedRenderSpans {
  readonly state: AnsiStyleState;
}

export interface RenderSpanSerializer {
  readonly write: (
    spans: readonly RenderSpan[],
    state?: AnsiStyleState,
  ) => SerializedRenderSpanChunk;
  readonly transition: (
    style: TerminalStyle | undefined,
    link: TerminalLink | undefined,
    state?: AnsiStyleState,
  ) => SerializedRenderSpanChunk;
  readonly finish: (state: AnsiStyleState) => string;
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
  const serializer = createRenderSpanSerializer(options);
  const chunk = serializer.write(spans);
  return Object.freeze({
    text: chunk.text + serializer.finish(chunk.state),
    usesStyle: chunk.usesStyle,
    usesHyperlink: chunk.usesHyperlink,
  });
}

export function createRenderSpanSerializer(
  options?: RenderSerializeOptions,
): RenderSpanSerializer {
  const policy = createTerminalSerializationPolicy(options);
  const theme = themeForOptions(options);
  const transition = (
    style: TerminalStyle | undefined,
    link: TerminalLink | undefined,
    initialState: AnsiStyleState = {},
  ): SerializedRenderSpanChunk => {
    let text = '';
    let state = initialState;
    const nextLink = link === undefined ? undefined : effectiveLink({ text: '', link }, options);
    const nextStyle = policy.effectiveStyle(resolveTerminalStyle(style, theme));
    if (!sameTerminalLink(state.link, nextLink)) {
      text += closeLink(state, policy);
      text += openLink(nextLink, policy);
      state = nextLink === undefined ? withoutLink(state) : { ...state, link: nextLink };
    }
    if (!sameTerminalStyle(state.style, nextStyle)) {
      text += policy.styleTransition(state.style, nextStyle);
      state = nextStyle === undefined ? withoutStyle(state) : { ...state, style: nextStyle };
    }
    return Object.freeze({
      text,
      state,
      usesStyle: nextStyle !== undefined,
      usesHyperlink: nextLink !== undefined,
    });
  };
  return Object.freeze({
    write(spans: readonly RenderSpan[], initialState: AnsiStyleState = {}): SerializedRenderSpanChunk {
  let output = '';
      let state = initialState;
  let usesStyle = false;
  let usesHyperlink = false;
  for (const currentSpan of spans) {
    const text = sanitizeTerminalCellText(currentSpan.text).text;
    if (text.length === 0) continue;
        const changed = transition(currentSpan.style, currentSpan.link, state);
        usesStyle ||= changed.usesStyle;
        usesHyperlink ||= changed.usesHyperlink;
        output += changed.text;
        state = changed.state;
    output += text;
  }
      return Object.freeze({ text: output, state, usesStyle, usesHyperlink });
    },
    transition,
    finish(state: AnsiStyleState): string {
      return closeLink(state, policy) + closeStyle(state, policy);
    },
  });
}

function themeForOptions(options: RenderSerializeOptions | undefined): TerminalTheme {
  const theme = options?.theme;
  if (theme === undefined) return defaultTheme;
  return resolveThemeInput(theme, defaultTheme);
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
  return decodeTerminalLink(span.link);
}

function openLink(link: TerminalLink | undefined, policy: TerminalSerializationPolicy): string {
  if (link === undefined) return '';
  return policy.openHyperlink(link);
}

function closeLink(state: AnsiStyleState, policy: TerminalSerializationPolicy): string {
  return state.link === undefined ? '' : policy.closeHyperlink();
}
