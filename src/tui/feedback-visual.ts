import type { RenderNode } from '../render-node/index.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { ProcessStatus } from '../components/contracts.ts';
import { normalizeProcessStatus } from '../components/status.ts';
import { renderNodeFrameSource } from './frame-source.ts';
import { block, line, measureRenderSpans, span } from './render-primitives.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { FrameSemanticRole } from './frame-passes/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { mergeStyles, renderNodeStyle } from './render-node-style.ts';
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
  readonly state?: string | undefined;
}

export function statusBarBlock(widget: RenderNode): RenderBlock {
  return block([line([
    feedbackSpan(widget, stringify(widget.props['text']), {
      kind: 'statusBar',
      label: 'value',
      style: feedbackBarValueStyle(widget)
    })
  ])]);
}

export function statusBarText(widget: RenderNode): string {
  return blockText(statusBarBlock(widget));
}

export function helpBarBlock(widget: RenderNode, maxCells?: number): RenderBlock {
  const bindings = helpBindings(widget);
  const spans = fitHelpBindingSpans(widget, bindings, maxCells);
  return block([line(spans)]);
}

function fitHelpBindingSpans(
  widget: RenderNode,
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
  widget: RenderNode,
  bindings: readonly { readonly key: string; readonly label: string }[]
): readonly RenderSpan[] {
  return bindings.flatMap((binding, index): readonly RenderSpan[] =>
    helpBindingGroupSpans(widget, binding, index, index > 0)
  );
}

function helpBindingGroupSpans(
  widget: RenderNode,
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
      style: feedbackBarSeparatorStyle(widget)
    })] : []),
    feedbackSpan(widget, binding.key, {
      kind: 'helpBar',
      label: `${bindingLabel}.key`,
      style: helpKeyStyle(widget)
    }),
    feedbackSpan(widget, ` ${binding.label}`, {
      kind: 'helpBar',
      label: `${bindingLabel}.label`,
      style: feedbackBarValueStyle(widget)
    })
  ];
}

function helpKeyStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(
    feedbackBarValueStyle(widget),
    {
      fg: { kind: 'theme', token: 'keyHint.foreground' },
      bg: { kind: 'theme', token: 'keyHint.background' },
      bold: true
    },
    renderNodeStyle(widget, 'label')
  );
}

function appendHelpOverflow(widget: RenderNode, fitted: RenderSpan[], maxCells: number): void {
  if (maxCells <= 0) return;
  const marker = feedbackSpan(widget, '…', {
    kind: 'helpBar',
    label: 'overflow',
    role: 'decoration',
    style: renderNodeStyle(widget, 'placeholder')
  });
  const separatedMarker = fitted.length === 0
    ? [marker]
    : [
        feedbackSpan(widget, '  ', {
      kind: 'helpBar',
      label: 'overflow.separator',
      role: 'separator',
      style: feedbackBarSeparatorStyle(widget)
    }),
        marker
      ];
  if (measureRenderSpans([...fitted, ...separatedMarker]) <= maxCells) {
    fitted.push(...separatedMarker);
    return;
  }
  if (fitted.length === 0 && measureRenderSpans([marker]) <= maxCells) fitted.push(marker);
}

export function helpBarText(widget: RenderNode): string {
  return blockText(helpBarBlock(widget));
}

export function activityIndicatorBlock(widget: RenderNode, theme: TerminalTheme): RenderBlock {
  const label = stringify(widget.props['label']) || 'Activity';
  const status = normalizeProcessStatus(widget.props['status']);
  return block([line(statusLineSpans(widget, {
    kind: 'activityIndicator',
    label,
    status,
    marker: statusMarker(status, theme),
    showRunningStatus: true
  }))]);
}

export function activityIndicatorText(widget: RenderNode, theme: TerminalTheme): string {
  return blockText(activityIndicatorBlock(widget, theme));
}

export function spinnerBlock(widget: RenderNode, theme: TerminalTheme): RenderBlock {
  const status = normalizeProcessStatus(widget.props['status'], 'running');
  const label = stringify(widget.props['label']) || 'Loading';
  return block([line(statusLineSpans(widget, {
    kind: 'spinner',
    label,
    status,
    marker: spinnerMarker(widget, theme, status),
    showRunningStatus: false
  }))]);
}

export function spinnerText(widget: RenderNode, theme: TerminalTheme): string {
  return blockText(spinnerBlock(widget, theme));
}

export function feedbackStatusMarkerSpan(
  widget: RenderNode,
  kind: FeedbackVisualKind,
  label: string,
  status: ProcessStatus,
  marker: string
): RenderSpan {
  return feedbackSpan(widget, marker, {
    kind,
    label,
    role: 'decoration',
    style: statusStyle(status),
    state: status
  });
}

export function feedbackTextSpan(
  widget: RenderNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(widget, 'value')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, style });
}

export function feedbackStructureSpan(
  widget: RenderNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(widget, 'placeholder')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, role: 'decoration', style });
}

export function blockText(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

function statusLineSpans(
  widget: RenderNode,
  input: {
    readonly kind: FeedbackVisualKind;
    readonly label: string;
    readonly status: ProcessStatus;
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
      style: feedbackBarSeparatorStyle(widget)
    }),
    feedbackSpan(widget, input.label, {
      kind: input.kind,
      label: 'label',
      style: feedbackBarValueStyle(widget)
    }),
    ...statusSuffixSpans(widget, input.kind, input.status, input.showRunningStatus)
  ];
}

function statusSuffixSpans(
  widget: RenderNode,
  kind: FeedbackVisualKind,
  status: ProcessStatus,
  showRunningStatus: boolean
): readonly RenderSpan[] {
  if (status === 'idle' || (status === 'running' && !showRunningStatus)) return [];
  return [
    feedbackStructureSpan(widget, ' (', kind, 'status.open'),
    feedbackSpan(widget, status, {
      kind,
      label: 'status.value',
      style: statusStyle(status),
      state: status
    }),
    feedbackStructureSpan(widget, ')', kind, 'status.close')
  ];
}

function spinnerMarker(widget: RenderNode, theme: TerminalTheme, status: ProcessStatus): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(widget, theme);
  const frameIndex = numberProp(widget, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.tokens.symbols.statusInfo;
}

function spinnerFrames(widget: RenderNode, theme: TerminalTheme): readonly string[] {
  const frames = widget.props['frames'];
  if (!Array.isArray(frames)) return theme.tokens.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.tokens.symbols.spinnerFrames : cleaned;
}

function helpBindings(widget: RenderNode): readonly { readonly key: string; readonly label: string }[] {
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
  widget: RenderNode,
  text: string,
  options: FeedbackSpanOptions
): RenderSpan {
  return span(text, {
    ...(options.style === undefined ? {} : { style: options.style }),
    source: renderNodeFrameSource(widget, {
      family: 'feedback',
      role: options.role ?? 'text',
      part: options.label,
      partKind: options.kind,
      ...(options.sourceId === undefined ? {} : { itemId: options.sourceId }),
      ...(options.state === undefined ? {} : { state: options.state }),
      label: options.label
    })
  });
}

function feedbackBarValueStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(widget, 'value')
  );
}

function feedbackBarSeparatorStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(widget, 'placeholder')
  );
}
