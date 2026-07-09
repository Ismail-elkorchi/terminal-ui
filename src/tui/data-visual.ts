import { highlightRenderSpans } from './text-highlight.ts';
import { frameSourcePart, renderNodeFrameSource } from './frame-source.ts';
import { themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';

export interface DataSourceOptions {
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly role?: FrameCellSource['role'];
  readonly partKind?: string;
  readonly state?: string;
}

export function selectionMarkerSpans(
  widget: RenderNode,
  selected: boolean,
  theme: TerminalTheme,
  style?: TerminalStyle,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const markerStyle = selected ? (style ?? renderNodeStyle(widget, 'value', 'selected')) : renderNodeStyle(widget, 'placeholder');
  const gapSource = frameSourcePart(source, {
    ...(source?.part === undefined ? {} : { part: `${source.part}.gap` }),
    ...(source?.label === undefined ? {} : { label: `${source.label}.gap` })
  });
  return [
    dataSpan(selected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected, markerStyle, source),
    dataSpan(' ', markerStyle, gapSource)
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

export function dataSource(widget: RenderNode, label: string, options: DataSourceOptions = {}): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'data',
    role: options.role ?? 'text',
    part: label,
    ...(options.partKind === undefined ? {} : { partKind: options.partKind }),
    ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    ...(options.itemIndex === undefined ? {} : { itemIndex: options.itemIndex }),
    ...(options.state === undefined ? {} : { state: options.state }),
    label
  });
}

export function dataSpan(text: string, style: TerminalStyle | undefined, source?: FrameCellSource): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(source === undefined ? {} : { source })
  };
}
