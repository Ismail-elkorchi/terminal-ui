import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { ActivityIndicatorStatus, Widget } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import { block, line, span } from './render-primitives.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './render-primitives.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './widget-props.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';
import { normalizeSpinnerFrameIndex } from './spinner.ts';

export function statusBarBlock(widget: Widget): RenderBlock {
  return block([line([
    feedbackSpan(widget, stringify(widget.props['text']), 'statusBar', 'value', widgetStyle(widget, 'value'))
  ])]);
}

export function statusBarText(widget: Widget): string {
  return blockText(statusBarBlock(widget));
}

export function helpBarBlock(widget: Widget): RenderBlock {
  const bindings = helpBindings(widget);
  const spans = bindings.flatMap((binding, index): readonly RenderSpan[] => [
    ...(index === 0 ? [] : [feedbackSpan(widget, '  ', 'helpBar', 'separator', widgetStyle(widget, 'placeholder'))]),
    feedbackSpan(widget, binding.key, 'helpBar', 'key', mergeStyles(widgetStyle(widget, 'label'), { bold: true })),
    feedbackSpan(widget, ` ${binding.label}`, 'helpBar', 'label', widgetStyle(widget, 'value'))
  ]);
  return block([line(spans)]);
}

export function helpBarText(widget: Widget): string {
  return blockText(helpBarBlock(widget));
}

export function activityIndicatorBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const label = stringify(widget.props['label']) || 'Activity';
  const status = normalizeWidgetProcessStatus(widget.props['status']);
  return block([line(statusLineSpans(widget, {
    kind: 'activityIndicator',
    label,
    status,
    marker: statusMarker(status, theme),
    showRunningStatus: true
  }))]);
}

export function activityIndicatorText(widget: Widget, theme: TerminalTheme): string {
  return blockText(activityIndicatorBlock(widget, theme));
}

export function spinnerBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const status = normalizeWidgetProcessStatus(widget.props['status'], 'running');
  const label = stringify(widget.props['label']) || 'Loading';
  return block([line(statusLineSpans(widget, {
    kind: 'spinner',
    label,
    status,
    marker: spinnerMarker(widget, theme, status),
    showRunningStatus: false
  }))]);
}

export function spinnerText(widget: Widget, theme: TerminalTheme): string {
  return blockText(spinnerBlock(widget, theme));
}

export function feedbackStatusMarkerSpan(
  widget: Widget,
  kind: string,
  label: string,
  status: ActivityIndicatorStatus,
  marker: string
): RenderSpan {
  return feedbackSpan(widget, marker, kind, label, statusStyle(status));
}

export function feedbackTextSpan(
  widget: Widget,
  text: string,
  kind: string,
  label: string,
  style: TerminalStyle | undefined = widgetStyle(widget, 'value')
): RenderSpan {
  return feedbackSpan(widget, text, kind, label, style);
}

export function blockText(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

function statusLineSpans(
  widget: Widget,
  input: {
    readonly kind: string;
    readonly label: string;
    readonly status: ActivityIndicatorStatus;
    readonly marker: string;
    readonly showRunningStatus: boolean;
  }
): readonly RenderSpan[] {
  return [
    feedbackStatusMarkerSpan(widget, input.kind, 'marker', input.status, input.marker),
    feedbackSpan(widget, ' ', input.kind, 'gap', widgetStyle(widget, 'placeholder')),
    feedbackSpan(widget, input.label, input.kind, 'label', widgetStyle(widget, 'value')),
    ...statusSuffixSpans(widget, input.kind, input.status, input.showRunningStatus)
  ];
}

function statusSuffixSpans(
  widget: Widget,
  kind: string,
  status: ActivityIndicatorStatus,
  showRunningStatus: boolean
): readonly RenderSpan[] {
  if (status === 'idle' || (status === 'running' && !showRunningStatus)) return [];
  return [
    feedbackSpan(widget, ' (', kind, 'status-open', widgetStyle(widget, 'placeholder')),
    feedbackSpan(widget, status, kind, 'status', statusStyle(status)),
    feedbackSpan(widget, ')', kind, 'status-close', widgetStyle(widget, 'placeholder'))
  ];
}

function spinnerMarker(widget: Widget, theme: TerminalTheme, status: ActivityIndicatorStatus): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(widget, theme);
  const frameIndex = numberProp(widget, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.symbols.statusInfo;
}

function spinnerFrames(widget: Widget, theme: TerminalTheme): readonly string[] {
  const frames = widget.props['frames'];
  if (!Array.isArray(frames)) return theme.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.symbols.spinnerFrames : cleaned;
}

function helpBindings(widget: Widget): readonly { readonly key: string; readonly label: string }[] {
  if (!Array.isArray(widget.props['bindings'])) return [];
  return widget.props['bindings'].filter((binding): binding is { readonly key: string; readonly label: string } =>
    typeof binding === 'object'
    && binding !== null
    && typeof (binding as { readonly key?: unknown }).key === 'string'
    && typeof (binding as { readonly label?: unknown }).label === 'string'
  ).map((binding) => ({
    key: sanitizeTerminalText(binding.key).text,
    label: sanitizeTerminalText(binding.label).text
  }));
}

function feedbackSpan(
  widget: Widget,
  text: string,
  kind: string,
  label: string,
  style: TerminalStyle | undefined
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
