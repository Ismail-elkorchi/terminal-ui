import { highlightRenderSpans } from './text-highlight.ts';
import { mergeStyles, themeStyle, widgetStyle } from './widget-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget, WidgetTone } from '../widgets/index.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';

export type CommandSurfaceTone = Extract<WidgetTone, 'info' | 'warning' | 'error' | 'success' | 'muted'>;

export function commandStatusSpans(
  widget: Widget,
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
  const textStyle = options.textStyle ?? (tone === 'muted' ? widgetStyle(widget, 'value', 'disabled') : markerStyle);
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

export function commandRowStyle(widget: Widget, selected: boolean, disabled = false): TerminalStyle | undefined {
  if (selected && disabled) return mergeStyles(widgetStyle(widget, 'value', 'selected'), widgetStyle(widget, 'value', 'disabled'));
  if (selected) return widgetStyle(widget, 'value', 'selected');
  if (disabled) return widgetStyle(widget, 'value', 'disabled');
  return widgetStyle(widget, 'value');
}

export function commandMetadataStyle(widget: Widget, selected: boolean, disabled = false): TerminalStyle | undefined {
  return mergeStyles(
    selected ? widgetStyle(widget, 'value', 'selected') : undefined,
    widgetStyle(widget, 'value', disabled ? 'disabled' : undefined)
  );
}

export function commandSelectionMarkerSpans(
  widget: Widget,
  theme: TerminalTheme,
  selected: boolean,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const style = selected ? widgetStyle(widget, 'value', 'selected') : undefined;
  return [
    styledSpan(`${selected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected} `, style, source)
  ];
}

export function commandGroupSpans(widget: Widget, group: string | undefined, selected: boolean, source?: FrameCellSource): readonly RenderSpan[] {
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

function commandToneStyle(widget: Widget, tone: CommandSurfaceTone): TerminalStyle | undefined {
  switch (tone) {
    case 'info':
      return widgetStyle(widget, 'value', 'focused');
    case 'warning':
      return widgetStyle(widget, 'warning', 'warning');
    case 'error':
      return widgetStyle(widget, 'error', 'error');
    case 'success':
      return widgetStyle(widget, 'success', 'success');
    case 'muted':
      return widgetStyle(widget, 'value', 'disabled');
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
