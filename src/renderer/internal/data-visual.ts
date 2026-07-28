import { highlightRenderSpans } from './text-highlight.ts';
import { frameSourcePart, isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { themeStyle, renderNodeStyle, styleHasBackground } from './render-node-style.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from '../../visual/render.ts';

export interface DataSourceOptions {
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly role?: FrameCellSource['cellRole'];
  readonly partType?: string;
  readonly state?: import('../../element/metadata.ts').ElementVisualState;
}

export function selectionMarkerSpans(
  renderNode: RenderNode,
  selected: boolean,
  theme: TerminalTheme,
  style?: TerminalStyle,
  source?: FrameCellSource
): readonly RenderSpan[] {
  const markerStyle = selected ? (style ?? renderNodeStyle(renderNode, 'marker', 'selected')) : renderNodeStyle(renderNode, 'marker');
  const gapSource = frameSourcePart(source, {
    ...(source?.partName === undefined ? {} : { partName: `${source.partName}.gap` }),
    ...(source?.description === undefined ? {} : { description: `${source.description}.gap` })
  });
  const marker = selected && !styleHasBackground(markerStyle, theme)
    ? theme.tokens.symbols.selected
    : theme.tokens.symbols.unselected;
  return [
    dataSpan(marker, markerStyle, source),
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
    readonly matchStyle?: TerminalStyle;
  } = {}
): readonly RenderSpan[] {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [dataSpan(text, baseStyle, options.source)];
  return highlightRenderSpans(text, normalizedQuery, {
    ...(baseStyle === undefined ? {} : { baseStyle }),
    matchStyle: options.matchStyle ?? themeStyle('menu.match', { underline: true })
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

export function dataSource(
  renderNode: RenderNode,
  description: string,
  options: DataSourceOptions = {}
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'data',
    cellRole: options.role ?? 'text',
    partName: description,
    ...(options.partType === undefined ? {} : { partType: options.partType }),
    ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    ...(options.itemIndex === undefined ? {} : { itemIndex: options.itemIndex }),
    ...(isFrameCellInteractionState(options.state)
      ? { interactionState: options.state }
      : {}),
    description
  });
}

export function dataSpan(text: string, style: TerminalStyle | undefined, source?: FrameCellSource): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(source === undefined ? {} : { source })
  };
}
