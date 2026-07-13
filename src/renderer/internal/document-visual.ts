import type { RenderNode } from '../model/index.ts';
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
  readonly state?: string;
}

export function documentSpan(
  widget: RenderNode,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle,
  sourceOptions: DocumentSourceOptions = {}
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: documentSource(widget, kind, visual, label, sourceOptions)
  });
}

export function documentHighlightSpans(input: {
  readonly widget: RenderNode;
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
      input.widget,
      input.kind,
      current.matched === true ? 'match' : input.visual,
      current.matched === true ? `${input.label}.match` : input.label,
      input.sourceOptions
    )
  }));
}

export function documentSource(
  widget: RenderNode,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string,
  sourceOptions: DocumentSourceOptions = {}
): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: kind,
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    ...sourceOptions,
    label
  });
}

export function documentStatusStyle(status: RecordStatus): TerminalStyle {
  return mergeStyles(statusStyle(baseStatusForRecordStatus(status)), { bold: true }) ?? { bold: true };
}

export function documentMarkerStyle(widget: RenderNode, selected = false): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'marker', selected ? 'selected' : undefined);
}

export function documentTitleStyle(
  widget: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'title'),
    baseStyle,
    selected ? renderNodeStyle(widget, 'title', 'selected') : undefined
  );
}

export function documentSummaryStyle(widget: RenderNode, selected = false): TerminalStyle | undefined {
  return selected
    ? renderNodeStyle(widget, 'summary', 'selected')
    : renderNodeStyle(widget, 'summary');
}

export function documentBodyStyle(
  widget: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'body'),
    baseStyle,
    selected ? renderNodeStyle(widget, 'body', 'selected') : undefined
  );
}

export function documentDetailStyle(
  widget: RenderNode,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'details'),
    baseStyle,
    selected ? renderNodeStyle(widget, 'details', 'selected') : undefined
  );
}

export function documentFieldSpans(
  widget: RenderNode,
  field: FieldItem,
  labelWidth: number,
  selected = false,
  kind: DocumentSurfaceKind = 'structuredBlock',
  sourceOptions: DocumentSourceOptions = {}
): readonly RenderSpan[] {
  const labelStyle = mergeStyles(
    renderNodeStyle(widget, 'field', selected ? 'selected' : undefined)
  );
  const valueStyle = selected
    ? renderNodeStyle(widget, 'field', 'selected')
    : renderNodeStyle(widget, 'field');
  const separatorStyle = selected
    ? renderNodeStyle(widget, 'separator', 'selected')
    : renderNodeStyle(widget, 'separator');
  const key = sourceToken(field.label);
  return [
    documentSpan(widget, kind, 'field', `field.${key}.label`, field.label.padEnd(labelWidth), labelStyle, sourceOptions),
    documentSpan(widget, kind, 'separator', `field.${key}.separator`, ': ', separatorStyle, sourceOptions),
    documentSpan(widget, kind, 'field', `field.${key}.value`, field.value, valueStyle, sourceOptions)
  ];
}

export function scrollbackTimestampStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(widget, 'timestamp'), themeStyle('log.timestamp'));
}

export function scrollbackMetadataStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(widget, 'metadata'), themeStyle('log.metadata'));
}

export function scrollbackMetadataSeparatorStyle(widget: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'separator');
}

export function scrollbackSelectedStyle(widget: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'body', 'selected');
}

export function scrollbackBodyStyle(
  widget: RenderNode,
  itemStyle: TerminalStyle | undefined,
  level: LogLevel | undefined,
  selected = false
): TerminalStyle | undefined {
  return documentBodyStyle(widget, mergeStyles(scrollbackLogLevelStyle(level), itemStyle), selected);
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

export function scrollbackOmissionStyle(widget: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'marker');
}

export function documentEmptyStyle(widget: RenderNode): TerminalStyle | undefined {
  return renderNodeStyle(widget, 'empty');
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
