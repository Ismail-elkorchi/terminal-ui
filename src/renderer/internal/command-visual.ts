import { highlightRenderSpans } from './text-highlight.ts';
import { resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { ComponentTone } from '../../ui-model/contracts.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from '../../visual/render.ts';

export type CommandSurfaceTone = Extract<ComponentTone, 'info' | 'warning' | 'error' | 'success' | 'muted'>;

export function commandStatusSpans(
  renderNode: RenderNode,
  theme: TerminalTheme,
  tone: CommandSurfaceTone,
  text: string,
  options: {
    readonly textStyle?: TerminalStyle;
    readonly markerStyle?: TerminalStyle;
    readonly markerSource?: FrameCellSource;
    readonly textSource?: FrameCellSource;
  } = {}
): readonly RenderSpan[] {
  const markerStyle = options.markerStyle ?? commandToneStyle(renderNode, tone);
  const textStyle = options.textStyle ?? (tone === 'muted' ? renderNodeStyle(renderNode, 'status', 'disabled') : markerStyle);
  return [
    styledSpan(`${commandToneSymbol(theme, tone)} `, markerStyle, options.markerSource),
    styledSpan(text, textStyle, options.textSource)
  ];
}

export function commandMatchSpans(
  text: string,
  query: string,
  baseStyle?: TerminalStyle,
  options: {
    readonly source?: FrameCellSource;
    readonly matchSource?: FrameCellSource;
  } = {}
): readonly RenderSpan[] {
  return highlightRenderSpans(text, query.trim(), {
    ...(baseStyle === undefined ? {} : { baseStyle }),
    matchStyle: themeStyle('command.match', { underline: true })
  }).map((current) => ({
    text: current.text,
    ...(current.style === undefined ? {} : { style: current.style }),
    ...(current.link === undefined ? {} : { link: current.link }),
    ...(current.matched === true
      ? { source: options.matchSource ?? options.source }
      : options.source === undefined ? {} : { source: options.source })
  }));
}

export function commandRowStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  const part = commandPrimaryPart(renderNode);
  const base = themeStyle('text.default');
  return resolveRenderNodeStyle(renderNode, {
    part,
    base,
    ...(state === undefined ? {} : { state })
  });
}

export function commandMetadataStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  const part = renderNode.kind === 'palette' ? 'description' : 'suggestion';
  return renderNodeStyle(renderNode, part, state);
}

export function commandSelectionMarkerSpans(
  renderNode: RenderNode,
  theme: TerminalTheme,
  selected: boolean,
  state: ElementVisualState | undefined,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const style = state === undefined ? undefined : renderNodeStyle(renderNode, commandPrimaryPart(renderNode), state);
  return [
    styledSpan(`${selected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected} `, style, source)
  ];
}

export function commandGroupSpans(renderNode: RenderNode, group: string | undefined, state: ElementVisualState | undefined, source?: FrameCellSource): readonly RenderSpan[] {
  if (group === undefined || group.length === 0) return [];
  const style = commandMetadataStyle(renderNode, state);
  return [
    styledSpan(`[${group}] `, style, source)
  ];
}

export function styledSpan(text: string, style: TerminalStyle | undefined, source?: FrameCellSource): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(source === undefined ? {} : { source })
  };
}

function commandToneStyle(renderNode: RenderNode, tone: CommandSurfaceTone): TerminalStyle | undefined {
  switch (tone) {
    case 'info':
      return renderNodeStyle(renderNode, 'status', 'focused');
    case 'warning':
      return renderNodeStyle(renderNode, 'status', 'warning');
    case 'error':
      return renderNodeStyle(renderNode, 'status', 'error');
    case 'success':
      return renderNodeStyle(renderNode, 'status', 'success');
    case 'muted':
      return renderNodeStyle(renderNode, 'status', 'disabled');
  }
}

function commandPrimaryPart(renderNode: RenderNode): 'entry' | 'suggestion' {
  return renderNode.kind === 'palette' ? 'entry' : 'suggestion';
}

function commandToneSymbol(theme: TerminalTheme, tone: CommandSurfaceTone): string {
  switch (tone) {
    case 'info':
      return theme.tokens.symbols.statusInfo;
    case 'warning':
      return theme.tokens.symbols.statusWarning;
    case 'error':
      return theme.tokens.symbols.statusError;
    case 'success':
      return theme.tokens.symbols.statusSuccess;
    case 'muted':
      return theme.tokens.symbols.unselected;
  }
}
