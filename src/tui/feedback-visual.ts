import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { WidgetProcessStatus, Widget } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import { widgetFrameSource } from './frame-source.ts';
import { block, line, measureRenderSpans, span } from './render-primitives.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { FrameSemanticRole } from './frame-passes/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './widget-props.ts';
import { mergeStyles, widgetStyle } from './widget-style.ts';
import { normalizeSpinnerFrameIndex } from './spinner.ts';

export type FeedbackVisualKind =
  | 'statusBar'
  | 'helpBar'
  | 'activityIndicator'
  | 'spinner'
  | 'progressBar'
  | 'notification';

export interface FeedbackSpanOptions {
  readonly kind: FeedbackVisualKind;
  readonly label: string;
  readonly style?: TerminalStyle | undefined;
  readonly role?: FrameSemanticRole | undefined;
  readonly sourceId?: string | undefined;
}

export function statusBarBlock(widget: Widget): RenderBlock {
  return block([line([
    feedbackSpan(widget, stringify(widget.props['text']), {
      kind: 'statusBar',
      label: 'value',
      style: widgetStyle(widget, 'value')
    })
  ])]);
}

export function statusBarText(widget: Widget): string {
  return blockText(statusBarBlock(widget));
}

export function helpBarBlock(widget: Widget, maxCells?: number): RenderBlock {
  const bindings = helpBindings(widget);
  const spans = fitHelpBindingSpans(widget, bindings, maxCells);
  return block([line(spans)]);
}

function fitHelpBindingSpans(
  widget: Widget,
  bindings: readonly { readonly key: string; readonly label: string }[],
  maxCells: number | undefined
): readonly RenderSpan[] {
  if (maxCells === undefined) return helpBindingSpans(widget, bindings);
  const fitted: RenderSpan[] = [];
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (binding === undefined) continue;
    const group = helpBindingGroupSpans(widget, binding, index, fitted.length > 0);
    if (measureRenderSpans([...fitted, ...group]) <= maxCells) {
      fitted.push(...group);
      continue;
    }
    appendHelpOverflow(widget, fitted, maxCells);
    break;
  }
  return fitted;
}

function helpBindingSpans(
  widget: Widget,
  bindings: readonly { readonly key: string; readonly label: string }[]
): readonly RenderSpan[] {
  return bindings.flatMap((binding, index): readonly RenderSpan[] =>
    helpBindingGroupSpans(widget, binding, index, index > 0)
  );
}

function helpBindingGroupSpans(
  widget: Widget,
  binding: { readonly key: string; readonly label: string },
  index: number,
  separated: boolean
): readonly RenderSpan[] {
  const bindingLabel = `binding.${String(index)}`;
  return [
    ...(separated ? [feedbackSpan(widget, '  ', {
      kind: 'helpBar',
      label: `${bindingLabel}.separator`,
      role: 'separator',
      style: widgetStyle(widget, 'placeholder')
    })] : []),
    feedbackSpan(widget, binding.key, {
      kind: 'helpBar',
      label: `${bindingLabel}.key`,
      style: helpKeyStyle(widget)
    }),
    feedbackSpan(widget, ` ${binding.label}`, {
      kind: 'helpBar',
      label: `${bindingLabel}.label`,
      style: widgetStyle(widget, 'value')
    })
  ];
}

function helpKeyStyle(widget: Widget): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'keyHint.foreground' },
      bg: { kind: 'theme', token: 'keyHint.background' },
      bold: true
    },
    widgetStyle(widget, 'label')
  );
}

function appendHelpOverflow(widget: Widget, fitted: RenderSpan[], maxCells: number): void {
  if (maxCells <= 0) return;
  const marker = feedbackSpan(widget, '…', {
    kind: 'helpBar',
    label: 'overflow',
    role: 'decoration',
    style: widgetStyle(widget, 'placeholder')
  });
  const separatedMarker = fitted.length === 0
    ? [marker]
    : [
        feedbackSpan(widget, '  ', {
          kind: 'helpBar',
          label: 'overflow.separator',
          role: 'separator',
          style: widgetStyle(widget, 'placeholder')
        }),
        marker
      ];
  if (measureRenderSpans([...fitted, ...separatedMarker]) <= maxCells) {
    fitted.push(...separatedMarker);
    return;
  }
  if (fitted.length === 0 && measureRenderSpans([marker]) <= maxCells) fitted.push(marker);
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
  kind: FeedbackVisualKind,
  label: string,
  status: WidgetProcessStatus,
  marker: string
): RenderSpan {
  return feedbackSpan(widget, marker, {
    kind,
    label,
    role: 'decoration',
    style: statusStyle(status)
  });
}

export function feedbackTextSpan(
  widget: Widget,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = widgetStyle(widget, 'value')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, style });
}

export function feedbackStructureSpan(
  widget: Widget,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = widgetStyle(widget, 'placeholder')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, role: 'decoration', style });
}

export function blockText(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

function statusLineSpans(
  widget: Widget,
  input: {
    readonly kind: FeedbackVisualKind;
    readonly label: string;
    readonly status: WidgetProcessStatus;
    readonly marker: string;
    readonly showRunningStatus: boolean;
  }
): readonly RenderSpan[] {
  return [
    feedbackStatusMarkerSpan(widget, input.kind, 'status.marker', input.status, input.marker),
    feedbackSpan(widget, ' ', {
      kind: input.kind,
      label: 'status.gap',
      role: 'separator',
      style: widgetStyle(widget, 'placeholder')
    }),
    feedbackSpan(widget, input.label, {
      kind: input.kind,
      label: 'label',
      style: widgetStyle(widget, 'value')
    }),
    ...statusSuffixSpans(widget, input.kind, input.status, input.showRunningStatus)
  ];
}

function statusSuffixSpans(
  widget: Widget,
  kind: FeedbackVisualKind,
  status: WidgetProcessStatus,
  showRunningStatus: boolean
): readonly RenderSpan[] {
  if (status === 'idle' || (status === 'running' && !showRunningStatus)) return [];
  return [
    feedbackStructureSpan(widget, ' (', kind, 'status.open'),
    feedbackSpan(widget, status, {
      kind,
      label: 'status.value',
      style: statusStyle(status)
    }),
    feedbackStructureSpan(widget, ')', kind, 'status.close')
  ];
}

function spinnerMarker(widget: Widget, theme: TerminalTheme, status: WidgetProcessStatus): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(widget, theme);
  const frameIndex = numberProp(widget, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.tokens.symbols.statusInfo;
}

function spinnerFrames(widget: Widget, theme: TerminalTheme): readonly string[] {
  const frames = widget.props['frames'];
  if (!Array.isArray(frames)) return theme.tokens.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.tokens.symbols.spinnerFrames : cleaned;
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

export function feedbackSpan(
  widget: Widget,
  text: string,
  options: FeedbackSpanOptions
): RenderSpan {
  return span(text, {
    ...(options.style === undefined ? {} : { style: options.style }),
    source: widgetFrameSource(widget, {
      family: 'feedback',
      role: options.role ?? 'text',
      part: options.label,
      partKind: options.kind,
      ...(options.sourceId === undefined ? {} : { itemId: options.sourceId }),
      label: options.label
    })
  });
}
