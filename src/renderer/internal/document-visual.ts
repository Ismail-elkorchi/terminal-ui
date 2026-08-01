import type { RenderNode } from '../model/index.ts';
import { highlightRenderSpans } from './text-highlight.ts';
import type { LogLevel } from '../../ui-model/contracts.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { span } from '../../visual/render.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, themeStyle, renderNodeStyle } from '../style-resolution.ts';

export type DocumentSurfaceKind = 'logViewer';
export type DocumentVisualKind =
  | 'body'
  | 'delimiter'
  | 'empty'
  | 'match'
  | 'metadata'
  | 'omission'
  | 'separator';

export interface DocumentHighlightSpan extends RenderSpan {
  readonly matched?: boolean;
}

export interface DocumentSourceOptions {
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly state?: FrameCellSource['interactionState'];
}

export function documentSpan(
  renderNode: RenderNode,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle,
  sourceOptions: DocumentSourceOptions = {}
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: documentSource(renderNode, kind, visual, label, sourceOptions)
  });
}

export function documentHighlightSpans(input: {
  readonly renderNode: RenderNode;
  readonly kind: DocumentSurfaceKind;
  readonly visual: Extract<DocumentVisualKind, 'body' | 'metadata'>;
  readonly label: string;
  readonly text: string;
  readonly query: string;
  readonly baseStyle?: TerminalStyle | undefined;
  readonly sourceOptions?: DocumentSourceOptions | undefined;
}): readonly DocumentHighlightSpan[] {
  return highlightRenderSpans(input.text, input.query.trim(), {
    ...(input.baseStyle === undefined ? {} : { baseStyle: input.baseStyle }),
    matchStyle: themeStyle('menu.match', { underline: true })
  }).map((current): DocumentHighlightSpan => ({
    ...current,
    source: documentSource(
      input.renderNode,
      input.kind,
      current.matched === true ? 'match' : input.visual,
      current.matched === true ? `${input.label}.match` : input.label,
      input.sourceOptions
    )
  }));
}

export function documentSource(
  renderNode: RenderNode,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string,
  sourceOptions: DocumentSourceOptions = {}
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: kind,
    cellRole: roleForVisual(visual),
    partName: label,
    partType: visual,
    ...(sourceOptions.itemId === undefined ? {} : { itemId: sourceOptions.itemId }),
    ...(sourceOptions.itemIndex === undefined ? {} : { itemIndex: sourceOptions.itemIndex }),
    ...(sourceOptions.state === undefined ? {} : { interactionState: sourceOptions.state }),
    description: label
  });
}

export function documentBodyStyle(
  renderNode: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(renderNode, 'body'),
    baseStyle,
    selected ? renderNodeStyle(renderNode, 'body', 'selected') : undefined
  );
}

export function logViewerTimestampStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'timestamp'), themeStyle('log.timestamp'));
}

export function logViewerMetadataStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'metadata'), themeStyle('log.metadata'));
}

export function logViewerMetadataSeparatorStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'separator');
}

export function logViewerSelectedStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'body', 'selected');
}

export function logViewerBodyStyle(
  renderNode: RenderNode,
  itemStyle: TerminalStyle | undefined,
  level: LogLevel | undefined,
  selected = false
): TerminalStyle | undefined {
  return documentBodyStyle(renderNode, mergeStyles(logViewerLogLevelStyle(level), itemStyle), selected);
}

export function logViewerLogLevelStyle(level: LogLevel | undefined): TerminalStyle | undefined {
  switch (level) {
    case 'info':
      return themeStyle('log.info');
    case 'warning':
      return themeStyle('log.warning');
    case 'error':
      return themeStyle('log.error');
    case undefined:
      return undefined;
  }
}

export function logViewerOmissionStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'marker');
}

export function documentEmptyStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'empty');
}

export function sourceToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return token.length === 0 ? 'value' : token;
}

function roleForVisual(visual: DocumentVisualKind): NonNullable<FrameCellSource['cellRole']> {
  switch (visual) {
    case 'delimiter':
    case 'empty':
    case 'omission':
      return 'decoration';
    case 'separator':
      return 'separator';
    case 'body':
    case 'match':
    case 'metadata':
      return 'text';
  }
}
