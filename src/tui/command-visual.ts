import { highlightRenderSpans } from './text-highlight.ts';
import { mergeStyles, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { ComponentTone } from '../components/contracts.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';

export type CommandSurfaceTone = Extract<ComponentTone, 'info' | 'warning' | 'error' | 'success' | 'muted'>;

export function commandStatusSpans(
  widget: RenderNode,
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
  const markerStyle = options.markerStyle ?? commandToneStyle(widget, tone);
  const textStyle = options.textStyle ?? (tone === 'muted' ? renderNodeStyle(widget, 'value', 'disabled') : markerStyle);
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

export function commandRowStyle(widget: RenderNode, selected: boolean, disabled = false): TerminalStyle | undefined {
  if (selected && disabled) return mergeStyles(renderNodeStyle(widget, 'value', 'selected'), renderNodeStyle(widget, 'value', 'disabled'));
  if (selected) return renderNodeStyle(widget, 'value', 'selected');
  if (disabled) return renderNodeStyle(widget, 'value', 'disabled');
  return renderNodeStyle(widget, 'value');
}

export function commandMetadataStyle(widget: RenderNode, selected: boolean, disabled = false): TerminalStyle | undefined {
  return mergeStyles(
    selected ? renderNodeStyle(widget, 'value', 'selected') : undefined,
    renderNodeStyle(widget, 'value', disabled ? 'disabled' : undefined)
  );
}

export function commandSelectionMarkerSpans(
  widget: RenderNode,
  theme: TerminalTheme,
  selected: boolean,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const style = selected ? renderNodeStyle(widget, 'value', 'selected') : undefined;
  return [
    styledSpan(`${selected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected} `, style, source)
  ];
}

export function commandGroupSpans(widget: RenderNode, group: string | undefined, selected: boolean, source?: FrameCellSource): readonly RenderSpan[] {
  if (group === undefined || group.length === 0) return [];
  const style = commandMetadataStyle(widget, selected);
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

function commandToneStyle(widget: RenderNode, tone: CommandSurfaceTone): TerminalStyle | undefined {
  switch (tone) {
    case 'info':
      return renderNodeStyle(widget, 'value', 'focused');
    case 'warning':
      return renderNodeStyle(widget, 'warning', 'warning');
    case 'error':
      return renderNodeStyle(widget, 'error', 'error');
    case 'success':
      return renderNodeStyle(widget, 'success', 'success');
    case 'muted':
      return renderNodeStyle(widget, 'value', 'disabled');
  }
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
