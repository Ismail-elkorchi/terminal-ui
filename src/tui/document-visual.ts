import { highlightRenderSpans } from './text-highlight.ts';
import type {
  StructuredBlockField,
  StructuredBlockStatus,
  Widget,
  WidgetStatus
} from '../widgets/index.ts';
import { span } from './render-primitives.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';
import { statusStyle } from './status-visual.ts';
import { mergeStyles, themeStyle, widgetStyle } from './widget-style.ts';

export type DocumentSurfaceKind = 'scrollback' | 'structuredBlock' | 'activityFeed';

export interface DocumentHighlightSpan extends RenderSpan {
  readonly matched?: boolean;
}

export function documentSpan(
  widget: Widget,
  kind: DocumentSurfaceKind,
  label: string,
  text: string,
  style?: TerminalStyle
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: {
      kind,
      role: label === 'separator' ? 'separator' : 'text',
      ...(widget.id === undefined ? {} : { id: widget.id }),
      label
    }
  });
}

export function documentHighlightSpans(input: {
  readonly widget: Widget;
  readonly kind: DocumentSurfaceKind;
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
    source: {
      kind: input.kind,
      role: 'text',
      ...(input.widget.id === undefined ? {} : { id: input.widget.id }),
      label: current.matched === true ? `${input.label}.match` : input.label
    }
  }));
}

export function documentStatusStyle(status: StructuredBlockStatus): TerminalStyle {
  return mergeStyles(statusStyle(recordBaseStatus(status)), { bold: true }) ?? { bold: true };
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

export function documentSummaryStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'value');
}

export function documentBodyStyle(
  widget: Widget,
  baseStyle: TerminalStyle | undefined
): TerminalStyle | undefined {
  return mergeStyles(widgetStyle(widget, 'value'), baseStyle);
}

export function documentDetailStyle(
  widget: Widget,
  baseStyle: TerminalStyle | undefined
): TerminalStyle | undefined {
  return mergeStyles(widgetStyle(widget, 'placeholder'), baseStyle);
}

export function documentFieldSpans(
  widget: Widget,
  field: StructuredBlockField,
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
  return [
    documentSpan(widget, kind, 'field.label', field.label.padEnd(labelWidth), labelStyle),
    documentSpan(widget, kind, 'field.separator', ': ', separatorStyle),
    documentSpan(widget, kind, 'field.value', field.value, valueStyle)
  ];
}

export function scrollbackMetadataStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

export function scrollbackBodyStyle(
  widget: Widget,
  itemStyle: TerminalStyle | undefined
): TerminalStyle | undefined {
  return mergeStyles(widgetStyle(widget, 'value'), itemStyle);
}

export function scrollbackOmissionStyle(widget: Widget): TerminalStyle | undefined {
  return widgetStyle(widget, 'placeholder');
}

function recordBaseStatus(status: StructuredBlockStatus): WidgetStatus {
  if (status === 'failed') return 'error';
  if (status === 'cancelled' || status === 'skipped') return 'warning';
  return status;
}
