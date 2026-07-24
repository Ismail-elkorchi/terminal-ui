import type { RenderNode } from '../model/index.ts';
import { padTextCells } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { highlightRenderSpans } from './text-highlight.ts';
import type { FieldItem, LogLevel, RecordStatus } from '../../ui-model/contracts.ts';
import { baseStatusForRecordStatus } from '../../ui-model/status.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { span } from '../../visual/render.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { statusStyle } from './status-visual.ts';
import { mergeStyles, themeStyle, renderNodeStyle } from './render-node-style.ts';

export type DocumentSurfaceKind = 'scrollback' | 'structuredBlock' | 'activityFeed';
export type DocumentVisualKind =
  | 'body'
  | 'chrome'
  | 'detail'
  | 'empty'
  | 'field'
  | 'match'
  | 'metadata'
  | 'marker'
  | 'omission'
  | 'separator'
  | 'status'
  | 'summary'
  | 'title';

export interface DocumentHighlightSpan extends RenderSpan {
  readonly matched?: boolean;
}

export interface DocumentSourceOptions {
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly state?: FrameCellSource['state'];
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
  readonly visual: Extract<DocumentVisualKind, 'body' | 'metadata' | 'summary' | 'title' | 'detail'>;
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
    family: kind,
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    ...(sourceOptions.itemId === undefined ? {} : { itemId: sourceOptions.itemId }),
    ...(sourceOptions.itemIndex === undefined ? {} : { itemIndex: sourceOptions.itemIndex }),
    ...(sourceOptions.state === undefined ? {} : { state: sourceOptions.state }),
    label
  });
}

export function documentStatusStyle(status: RecordStatus): TerminalStyle {
  return mergeStyles(statusStyle(baseStatusForRecordStatus(status)), { bold: true }) ?? { bold: true };
}

export function documentMarkerStyle(renderNode: RenderNode, selected = false): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'marker', selected ? 'selected' : undefined);
}

export function documentTitleStyle(
  renderNode: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(renderNode, 'title'),
    baseStyle,
    selected ? renderNodeStyle(renderNode, 'title', 'selected') : undefined
  );
}

export function documentSummaryStyle(renderNode: RenderNode, selected = false): TerminalStyle | undefined {
  return selected
    ? renderNodeStyle(renderNode, 'summary', 'selected')
    : renderNodeStyle(renderNode, 'summary');
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

export function documentDetailStyle(
  renderNode: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(renderNode, 'details'),
    baseStyle,
    selected ? renderNodeStyle(renderNode, 'details', 'selected') : undefined
  );
}

export function documentFieldSpans(
  renderNode: RenderNode,
  field: FieldItem,
  labelWidth: number,
  widthProfile: TextWidthProfile,
  selected = false,
  kind: DocumentSurfaceKind = 'structuredBlock',
  sourceOptions: DocumentSourceOptions = {}
): readonly RenderSpan[] {
  const labelStyle = mergeStyles(
    renderNodeStyle(renderNode, 'field', selected ? 'selected' : undefined)
  );
  const valueStyle = selected
    ? renderNodeStyle(renderNode, 'field', 'selected')
    : renderNodeStyle(renderNode, 'field');
  const separatorStyle = selected
    ? renderNodeStyle(renderNode, 'separator', 'selected')
    : renderNodeStyle(renderNode, 'separator');
  const key = sourceToken(field.label);
  return [
    documentSpan(
      renderNode,
      kind,
      'field',
      `field.${key}.label`,
      padTextCells(field.label, labelWidth, { widthProfile }),
      labelStyle,
      sourceOptions
    ),
    documentSpan(renderNode, kind, 'separator', `field.${key}.separator`, ': ', separatorStyle, sourceOptions),
    documentSpan(renderNode, kind, 'field', `field.${key}.value`, field.value, valueStyle, sourceOptions)
  ];
}

export function scrollbackTimestampStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'timestamp'), themeStyle('log.timestamp'));
}

export function scrollbackMetadataStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(renderNode, 'metadata'), themeStyle('log.metadata'));
}

export function scrollbackMetadataSeparatorStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'separator');
}

export function scrollbackSelectedStyle(renderNode: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(renderNode, 'body', 'selected');
}

export function scrollbackBodyStyle(
  renderNode: RenderNode,
  itemStyle: TerminalStyle | undefined,
  level: LogLevel | undefined,
  selected = false
): TerminalStyle | undefined {
  return documentBodyStyle(renderNode, mergeStyles(scrollbackLogLevelStyle(level), itemStyle), selected);
}

export function scrollbackLogLevelStyle(level: LogLevel | undefined): TerminalStyle | undefined {
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

export function scrollbackOmissionStyle(renderNode: RenderNode): TerminalStyle | undefined {
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

function roleForVisual(visual: DocumentVisualKind): NonNullable<FrameCellSource['role']> {
  switch (visual) {
    case 'chrome':
    case 'empty':
    case 'marker':
    case 'omission':
      return 'decoration';
    case 'separator':
      return 'separator';
    case 'body':
    case 'detail':
    case 'field':
    case 'match':
    case 'metadata':
    case 'status':
    case 'summary':
    case 'title':
      return 'text';
  }
}
