import { highlightRenderSpans } from './text-highlight.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';

export function selectionMarkerSpans(
  widget: Widget,
  selected: boolean,
  theme: TerminalTheme,
  style?: TerminalStyle
): readonly RenderSpan[] {
  const markerStyle = selected ? (style ?? widgetStyle(widget, 'value', 'selected')) : undefined;
  return [
    styledSpan(selected ? theme.symbols.pointer : theme.symbols.unselected, markerStyle),
    { text: ' ' }
  ];
}

export function dataValueSpans(
  text: string,
  query: string,
  baseStyle?: TerminalStyle
): readonly RenderSpan[] {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [styledSpan(text, baseStyle)];
  return highlightRenderSpans(text, normalizedQuery, {
    ...(baseStyle === undefined ? {} : { baseStyle }),
    matchStyle: themeStyle('menu.match', { underline: true })
  });
}

export function mergeDataStyles(...styles: readonly (TerminalStyle | undefined)[]): TerminalStyle | undefined {
  const merged = styles.reduce<TerminalStyle>((current, style) => style === undefined ? current : { ...current, ...style }, {});
  return Object.keys(merged).length === 0 ? undefined : merged;
}

function styledSpan(text: string, style: TerminalStyle | undefined): RenderSpan {
  return style === undefined ? { text } : { text, style };
}
