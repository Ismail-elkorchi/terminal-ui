import { highlightRenderSpans } from './text-highlight.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';

export interface DataSourceOptions {
  readonly id?: string;
  readonly role?: FrameCellSource['role'];
}

export function selectionMarkerSpans(
  widget: Widget,
  selected: boolean,
  theme: TerminalTheme,
  style?: TerminalStyle,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const markerStyle = selected ? (style ?? widgetStyle(widget, 'value', 'selected')) : undefined;
  const gapSource = source?.label === undefined
    ? source
    : { ...source, label: `${source.label}.gap` };
  return [
    dataSpan(selected ? theme.symbols.pointer : theme.symbols.unselected, markerStyle, source),
    dataSpan(' ', undefined, gapSource)
  ];
}

export function dataValueSpans(
  text: string,
  query: string,
  baseStyle?: TerminalStyle,
  options: {
    readonly source?: FrameCellSource;
    readonly matchSource?: FrameCellSource;
  } = {}
): readonly RenderSpan[] {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [dataSpan(text, baseStyle, options.source)];
  return highlightRenderSpans(text, normalizedQuery, {
    ...(baseStyle === undefined ? {} : { baseStyle }),
    matchStyle: themeStyle('menu.match', { underline: true })
  }).map((span) => dataSpan(
    span.text,
    span.style,
    span.matched === true ? options.matchSource ?? options.source : options.source
  ));
}

export function mergeDataStyles(...styles: readonly (TerminalStyle | undefined)[]): TerminalStyle | undefined {
  const merged = styles.reduce<TerminalStyle>((current, style) => style === undefined ? current : { ...current, ...style }, {});
  return Object.keys(merged).length === 0 ? undefined : merged;
}

export function dataSource(widget: Widget, label: string, options: DataSourceOptions = {}): FrameCellSource {
  return {
    ...(options.id === undefined && widget.id === undefined ? {} : { id: options.id ?? widget.id }),
    kind: widget.kind,
    role: options.role ?? 'text',
    label
  };
}

export function dataSpan(text: string, style: TerminalStyle | undefined, source?: FrameCellSource): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(source === undefined ? {} : { source })
  };
}
