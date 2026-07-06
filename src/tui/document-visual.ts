import { highlightRenderSpans } from './text-highlight.ts';
import type {
  WidgetFieldItem,
  WidgetLogLevel,
  WidgetRecordStatus,
  Widget
} from '../widgets/index.ts';
import { baseStatusForRecordStatus } from '../widgets/index.ts';
import { widgetFrameSource } from './frame-source.ts';
import { span } from './render-primitives.ts';
import type { FrameCellSource, RenderSpan, TerminalStyle } from './render-primitives.ts';
import { statusStyle } from './status-visual.ts';
import { mergeStyles, themeStyle, widgetStyle } from './widget-style.ts';

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

export function documentSpan(
  widget: Widget,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string,
  text: string,
  style?: TerminalStyle
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: documentSource(widget, kind, visual, label)
  });
}

export function documentHighlightSpans(input: {
  readonly widget: Widget;
  readonly kind: DocumentSurfaceKind;
  readonly visual: Extract<DocumentVisualKind, 'body' | 'metadata' | 'summary' | 'title' | 'detail'>;
  readonly label: string;
  readonly text: string;
  readonly query: string;
  readonly baseStyle?: TerminalStyle | undefined;
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
      current.matched === true ? `${input.label}.match` : input.label
    )
  }));
}

export function documentSource(
  widget: Widget,
  kind: DocumentSurfaceKind,
  visual: DocumentVisualKind,
  label: string
): FrameCellSource {
  return widgetFrameSource(widget, {
    family: kind,
    role: roleForVisual(visual),
    part: label,
    partKind: visual,
    label
  });
}

export function documentStatusStyle(status: WidgetRecordStatus): TerminalStyle {
  return mergeStyles(statusStyle(baseStatusForRecordStatus(status)), { bold: true }) ?? { bold: true };
}

export function documentMarkerStyle(widget: Widget, selected = false): TerminalStyle | undefined {
  return selected
    ? widgetStyle(widget, 'value', 'selected')
    : widgetStyle(widget, 'placeholder');
}

export function documentTitleStyle(
  widget: Widget,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    widgetStyle(widget, 'title'),
    baseStyle,
    selected ? widgetStyle(widget, 'value', 'selected') : undefined
  );
}

export function documentSummaryStyle(widget: Widget, selected = false): TerminalStyle | undefined {
  return selected
    ? mergeStyles(widgetStyle(widget, 'value'), widgetStyle(widget, 'value', 'selected'))
    : widgetStyle(widget, 'value');
}

export function documentBodyStyle(
  widget: Widget,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    widgetStyle(widget, 'value'),
    baseStyle,
    selected ? widgetStyle(widget, 'value', 'selected') : undefined
  );
}

export function documentDetailStyle(
  widget: Widget,
  baseStyle: TerminalStyle | undefined,
  selected = false
): TerminalStyle | undefined {
  return mergeStyles(
    widgetStyle(widget, 'placeholder'),
    baseStyle,
    selected ? widgetStyle(widget, 'value', 'selected') : undefined
  );
}

export function documentFieldSpans(
  widget: Widget,
  field: WidgetFieldItem,
  labelWidth: number,
  selected = false,
  kind: DocumentSurfaceKind = 'structuredBlock'
): readonly RenderSpan[] {
  const labelStyle = mergeStyles(
    widgetStyle(widget, 'label', selected ? 'selected' : undefined),
    selected ? widgetStyle(widget, 'value', 'selected') : undefined
  );
  const valueStyle = selected
    ? widgetStyle(widget, 'value', 'selected')
    : widgetStyle(widget, 'value');
  const separatorStyle = selected
    ? widgetStyle(widget, 'value', 'selected')
    : widgetStyle(widget, 'placeholder');
  const key = sourceToken(field.label);
  return [
    documentSpan(widget, kind, 'field', `field.${key}.label`, field.label.padEnd(labelWidth), labelStyle),
    documentSpan(widget, kind, 'separator', `field.${key}.separator`, ': ', separatorStyle),
    documentSpan(widget, kind, 'field', `field.${key}.value`, field.value, valueStyle)
  ];
}

export function scrollbackMetadataStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

export function scrollbackSelectedStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'value', 'selected');
}

export function scrollbackBodyStyle(
  widget: Widget,
  itemStyle: TerminalStyle | undefined,
  level: WidgetLogLevel | undefined,
  selected = false
): TerminalStyle | undefined {
  return documentBodyStyle(widget, mergeStyles(scrollbackLogLevelStyle(level), itemStyle), selected);
}

export function scrollbackLogLevelStyle(level: WidgetLogLevel | undefined): TerminalStyle | undefined {
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

export function scrollbackOmissionStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

export function documentEmptyStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
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
