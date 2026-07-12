import { highlightRenderSpans } from './text-highlight.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { ComponentTone } from '../ui-model/contracts.ts';
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
  const textStyle = options.textStyle ?? (tone === 'muted' ? renderNodeStyle(widget, 'status', 'disabled') : markerStyle);
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
  const part = commandPrimaryPart(widget);
  const base = themeStyle('text.default');
  if (selected && disabled) return mergeStyles(
    resolveRenderNodeStyle(widget, { part, base, state: 'selected' }),
    renderNodeStyle(widget, part, 'disabled')
  );
  return resolveRenderNodeStyle(widget, {
    part,
    base,
    ...(selected ? { state: 'selected' } : disabled ? { state: 'disabled' } : {})
  });
}

export function commandMetadataStyle(widget: RenderNode, selected: boolean, disabled = false): TerminalStyle | undefined {
  const part = widget.kind === 'palette' ? 'description' : 'suggestion';
  return mergeStyles(
    selected ? renderNodeStyle(widget, part, 'selected') : undefined,
    renderNodeStyle(widget, part, disabled ? 'disabled' : undefined)
  );
}

export function commandSelectionMarkerSpans(
  widget: RenderNode,
  theme: TerminalTheme,
  selected: boolean,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const style = selected ? renderNodeStyle(widget, commandPrimaryPart(widget), 'selected') : undefined;
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
      return renderNodeStyle(widget, 'status', 'focused');
    case 'warning':
      return renderNodeStyle(widget, 'status', 'warning');
    case 'error':
      return renderNodeStyle(widget, 'status', 'error');
    case 'success':
      return renderNodeStyle(widget, 'status', 'success');
    case 'muted':
      return renderNodeStyle(widget, 'status', 'disabled');
  }
}

function commandPrimaryPart(widget: RenderNode): 'entry' | 'suggestion' {
  return widget.kind === 'palette' ? 'entry' : 'suggestion';
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
