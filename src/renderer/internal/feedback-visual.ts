import type { RenderNodeOfKind, RenderNodesOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { HelpGroup, ProcessStatus } from '../../ui-model/contracts.ts';
import type { StatusBarItem, StatusBarSection } from '../../ui-model/feedback.ts';
import { normalizeComponentStatus, normalizeProcessStatus } from '../../ui-model/status.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { block, clipRenderSpans, line, measureRenderSpans, span } from '../../visual/render.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { FrameSemanticRole } from './frame-passes/index.ts';
import { statusMarker, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { mergeStyles, renderNodeStyle } from './render-node-style.ts';
import { normalizeSpinnerFrameIndex } from '../../behavior/spinner.ts';
import { inlineContentAccessibleText, isInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import { renderInlineContent } from './inline-content.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export type FeedbackVisualKind =
  | 'statusBar'
  | 'helpBar'
  | 'statusIndicator'
  | 'spinner'
  | 'progressBar'
  | 'notification';

type FeedbackNode = RenderNodesOfKind<
  unknown,
  'statusIndicator' | 'helpBar' | 'notificationStack' | 'progressBar' | 'spinner' | 'statusBar'
>;
type StatusBarNode = RenderNodeOfKind<unknown, 'statusBar'>;
type HelpBarNode = RenderNodeOfKind<unknown, 'helpBar'>;
type StatusIndicatorNode = RenderNodeOfKind<unknown, 'statusIndicator'>;
type SpinnerNode = RenderNodeOfKind<unknown, 'spinner'>;

export interface FeedbackSpanOptions {
  readonly kind: FeedbackVisualKind;
  readonly label: string;
  readonly style?: TerminalStyle | undefined;
  readonly role?: FrameSemanticRole | undefined;
  readonly sourceId?: string | undefined;
  readonly state?: import('../../visual/source.ts').FrameCellSource['state'] | undefined;
}

export function statusBarBlock(
  widget: StatusBarNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  maxCells?: number
): RenderBlock {
  const leading = statusBarSectionSpans(widget, 'leading', statusBarItems(widget.props.leading), theme);
  const center = statusBarSectionSpans(widget, 'center', statusBarItems(widget.props.center), theme);
  const trailing = statusBarSectionSpans(widget, 'trailing', statusBarItems(widget.props.trailing), theme);
  return block([line(maxCells === undefined
    ? joinedStatusBarSections(widget, [leading, center, trailing])
    : placedStatusBarSections(widget, leading, center, trailing, maxCells, widthProfile))]);
}

export function statusBarText(widget: StatusBarNode, theme: TerminalTheme, widthProfile: TextWidthProfile): string {
  return blockText(statusBarBlock(widget, theme, widthProfile));
}

export function statusBarAccessibleText(widget: StatusBarNode): string {
  return [widget.props.leading, widget.props.center, widget.props.trailing]
    .flatMap((section) => statusBarItems(section).map((item) => [
      item.leading === undefined ? '' : inlineContentAccessibleText(item.leading),
      item.text,
      item.trailing === undefined ? '' : inlineContentAccessibleText(item.trailing)
    ].filter((value) => value.length > 0).join(' ')))
    .join('  ');
}

function statusBarItems(value: unknown): readonly StatusBarItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly StatusBarItem[] => {
    if (typeof item !== 'object' || item === null) return [];
    const candidate = item as Partial<StatusBarItem>;
    if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') return [];
    const id = sanitizeTerminalText(candidate.id).text;
    const text = sanitizeTerminalText(candidate.text).text;
    const adornments = {
      ...(isInlineContent(candidate.leading) ? { leading: candidate.leading } : {}),
      ...(isInlineContent(candidate.trailing) ? { trailing: candidate.trailing } : {})
    };
    if (candidate.kind === 'status') {
      return [{ id, kind: 'status', text, status: normalizeComponentStatus(candidate.status), ...adornments }];
    }
    return candidate.kind === 'text' ? [{ id, kind: 'text', text, ...adornments }] : [];
  });
}

function statusBarSectionSpans(
  widget: StatusBarNode,
  section: StatusBarSection,
  items: readonly StatusBarItem[],
  theme: TerminalTheme
): readonly RenderSpan[] {
  return items.flatMap((item, index): readonly RenderSpan[] => {
    const part = `${section}.${item.id}`;
    const leading = statusInlineSpans(widget, item.leading, `${part}.leading`, 'leading', item.id, theme);
    const trailing = statusInlineSpans(widget, item.trailing, `${part}.trailing`, 'trailing', item.id, theme);
    const contentSpans = item.kind === 'status'
      ? [
          feedbackSpan(widget, statusMarker(item.status, theme), {
            kind: 'statusBar',
            label: `${part}.marker`,
            sourceId: item.id,
            style: statusStyle(item.status),
          }),
          feedbackSpan(widget, ' ', {
            kind: 'statusBar',
            label: `${part}.gap`,
            sourceId: item.id,
            role: 'separator',
            style: feedbackBarSeparatorStyle(widget)
          }),
          feedbackSpan(widget, item.text, {
            kind: 'statusBar',
            label: `${part}.value`,
            sourceId: item.id,
            style: statusStyle(item.status),
          })
        ]
      : [feedbackSpan(widget, item.text, {
          kind: 'statusBar',
          label: `${part}.value`,
          sourceId: item.id,
          style: feedbackBarValueStyle(widget)
        })];
    const itemSpans = [
      ...leading,
      ...(leading.length === 0 ? [] : [statusBarGap(widget, `${part}.leading.separator`)]),
      ...contentSpans,
      ...(trailing.length === 0 ? [] : [statusBarGap(widget, `${part}.trailing.separator`)]),
      ...trailing
    ];
    return index === 0
      ? itemSpans
      : [statusBarGap(widget, `${section}.separator.${String(index)}`), ...itemSpans];
  });
}

function statusInlineSpans(
  widget: StatusBarNode,
  content: InlineContent | undefined,
  part: string,
  stylePart: 'leading' | 'trailing',
  itemId: string,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (content === undefined) return [];
  const baseStyle = mergeStyles(feedbackBarValueStyle(widget), widget.styles?.parts?.[stylePart]);
  return renderInlineContent(content, {
    theme,
    ...(baseStyle === undefined ? {} : { baseStyle }),
    source: (_segment, index) => renderNodeFrameSource(widget, {
      family: 'feedback',
      role: 'text',
      part: `${part}.${String(index)}`,
      partKind: stylePart,
      itemId,
      label: `${part}.${String(index)}`
    })
  });
}

function joinedStatusBarSections(
  widget: StatusBarNode,
  sections: readonly (readonly RenderSpan[])[]
): readonly RenderSpan[] {
  const visible = sections.filter((section) => section.length > 0);
  return visible.flatMap((section, index): readonly RenderSpan[] =>
    index === 0 ? section : [statusBarGap(widget, `section.separator.${String(index)}`), ...section]
  );
}

function placedStatusBarSections(
  widget: StatusBarNode,
  leadingInput: readonly RenderSpan[],
  centerInput: readonly RenderSpan[],
  trailingInput: readonly RenderSpan[],
  maxCells: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (maxCells <= 0) return [];
  const trailing = clipRenderSpans(trailingInput, maxCells, { ellipsis: '…', mode: 'middle', widthProfile });
  const trailingWidth = measureRenderSpans(trailing, { widthProfile });
  const leadingBudget = Math.max(0, maxCells - trailingWidth - (trailingWidth > 0 ? 2 : 0));
  const leading = clipRenderSpans(leadingInput, leadingBudget, { ellipsis: '…', widthProfile });
  const leadingWidth = measureRenderSpans(leading, { widthProfile });
  const trailingStart = maxCells - trailingWidth;
  const center = clipRenderSpans(centerInput, maxCells, { ellipsis: '…', mode: 'middle', widthProfile });
  const centerWidth = measureRenderSpans(center, { widthProfile });
  const desiredCenterStart = Math.floor((maxCells - centerWidth) / 2);
  const centerFits = centerWidth > 0
    && desiredCenterStart >= leadingWidth + (leadingWidth > 0 ? 1 : 0)
    && desiredCenterStart + centerWidth <= trailingStart - (trailingWidth > 0 ? 1 : 0);
  const placements = [
    ...(leading.length === 0 ? [] : [{ start: 0, spans: leading }]),
    ...(centerFits ? [{ start: desiredCenterStart, spans: center }] : []),
    ...(trailing.length === 0 ? [] : [{ start: trailingStart, spans: trailing }])
  ].sort((left, right) => left.start - right.start);
  const output: RenderSpan[] = [];
  let column = 0;
  for (const placement of placements) {
    if (placement.start > column) output.push(statusBarFill(widget, placement.start - column));
    output.push(...placement.spans);
    column = placement.start + measureRenderSpans(placement.spans, { widthProfile });
  }
  if (column < maxCells) output.push(statusBarFill(widget, maxCells - column));
  return output;
}

function statusBarGap(widget: StatusBarNode, label: string): RenderSpan {
  return feedbackSpan(widget, '  ', {
    kind: 'statusBar',
    label,
    role: 'separator',
    style: feedbackBarSeparatorStyle(widget)
  });
}

function statusBarFill(widget: StatusBarNode, cells: number): RenderSpan {
  return feedbackSpan(widget, ' '.repeat(cells), {
    kind: 'statusBar',
    label: 'fill',
    role: 'decoration',
    style: feedbackBarValueStyle(widget)
  });
}

export function helpBarBlock(widget: HelpBarNode, widthProfile: TextWidthProfile, maxCells?: number): RenderBlock {
  const spans = fitHelpGroupSpans(widget, helpGroups(widget), maxCells, widthProfile);
  return block([line(spans)]);
}

function fitHelpGroupSpans(
  widget: HelpBarNode,
  groups: readonly HelpGroup[],
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (maxCells === undefined) return groups.flatMap((group, index) => helpGroupSpans(widget, group, index, index > 0));
  const fitted: RenderSpan[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group === undefined) continue;
    const groupSpans = helpGroupSpans(widget, group, groupIndex, fitted.length > 0);
    if (measureRenderSpans([...fitted, ...groupSpans], { widthProfile }) <= maxCells) {
      fitted.push(...groupSpans);
      continue;
    }
    appendPartialHelpGroup(widget, fitted, group, groupIndex, maxCells, widthProfile);
    appendHelpOverflow(widget, fitted, maxCells, widthProfile);
    break;
  }
  return fitted;
}

function helpGroupSpans(
  widget: HelpBarNode,
  group: HelpGroup,
  groupIndex: number,
  separated: boolean
): readonly RenderSpan[] {
  const prefix = helpGroupPrefixSpans(widget, group, groupIndex, separated);
  return [
    ...prefix,
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] =>
      helpBindingSpans(widget, binding, group.id, bindingIndex, group.label !== undefined || bindingIndex > 0)
    )
  ];
}

function helpGroupPrefixSpans(
  widget: HelpBarNode,
  group: HelpGroup,
  groupIndex: number,
  separated: boolean
): readonly RenderSpan[] {
  return [
    ...(separated ? [feedbackSpan(widget, '  ', {
      kind: 'helpBar',
      label: `group.${group.id}.separator`,
      role: 'separator',
      style: feedbackBarSeparatorStyle(widget)
    })] : []),
    ...(group.label === undefined ? [] : [
      feedbackSpan(widget, group.label, {
        kind: 'helpBar',
        label: `group.${group.id}.label`,
        sourceId: group.id,
        style: renderNodeStyle(widget, 'label')
      }),
      feedbackSpan(widget, ' ', {
        kind: 'helpBar',
        label: `group.${String(groupIndex)}.gap`,
        role: 'separator',
        style: feedbackBarSeparatorStyle(widget)
      })
    ])
  ];
}

function helpBindingSpans(
  widget: HelpBarNode,
  binding: { readonly key: string; readonly label: string },
  groupId: string,
  index: number,
  separated: boolean
): readonly RenderSpan[] {
  const bindingLabel = `group.${groupId}.binding.${String(index)}`;
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
      sourceId: groupId,
      style: helpKeyStyle(widget)
    }),
    feedbackSpan(widget, ` ${binding.label}`, {
      kind: 'helpBar',
      label: `${bindingLabel}.label`,
      sourceId: groupId,
      style: feedbackBarValueStyle(widget)
    })
  ];
}

function appendPartialHelpGroup(
  widget: HelpBarNode,
  fitted: RenderSpan[],
  group: HelpGroup,
  groupIndex: number,
  maxCells: number,
  widthProfile: TextWidthProfile
): void {
  const prefix = helpGroupPrefixSpans(widget, group, groupIndex, fitted.length > 0);
  if (measureRenderSpans([...fitted, ...prefix], { widthProfile }) <= maxCells) fitted.push(...prefix);
  for (let index = 0; index < group.bindings.length; index += 1) {
    const binding = group.bindings[index];
    if (binding === undefined) continue;
    const spans = helpBindingSpans(widget, binding, group.id, index, group.label !== undefined || index > 0);
    if (measureRenderSpans([...fitted, ...spans], { widthProfile }) > maxCells) break;
    fitted.push(...spans);
  }
}

function helpKeyStyle(widget: HelpBarNode): TerminalStyle | undefined {
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

function appendHelpOverflow(
  widget: HelpBarNode,
  fitted: RenderSpan[],
  maxCells: number,
  widthProfile: TextWidthProfile
): void {
  if (maxCells <= 0) return;
  const marker = feedbackSpan(widget, '…', {
    kind: 'helpBar',
    label: 'overflow',
    role: 'decoration',
    style: renderNodeStyle(widget, 'marker')
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
  if (measureRenderSpans([...fitted, ...separatedMarker], { widthProfile }) <= maxCells) {
    fitted.push(...separatedMarker);
    return;
  }
  if (fitted.length === 0 && measureRenderSpans([marker], { widthProfile }) <= maxCells) fitted.push(marker);
}

export function helpBarText(widget: HelpBarNode, widthProfile: TextWidthProfile): string {
  return blockText(helpBarBlock(widget, widthProfile));
}

export function statusIndicatorBlock(widget: StatusIndicatorNode, theme: TerminalTheme): RenderBlock {
  const label = stringify(widget.props.label) || 'Activity';
  const status = normalizeProcessStatus(widget.props.status);
  return block([line(statusLineSpans(widget, {
    kind: 'statusIndicator',
    label,
    status,
    marker: statusMarker(status, theme),
    showRunningStatus: true
  }))]);
}

export function statusIndicatorText(widget: StatusIndicatorNode, theme: TerminalTheme): string {
  return blockText(statusIndicatorBlock(widget, theme));
}

export function spinnerBlock(widget: SpinnerNode, theme: TerminalTheme): RenderBlock {
  const status = normalizeProcessStatus(widget.props.status, 'running');
  const label = stringify(widget.props.label) || 'Loading';
  return block([line(statusLineSpans(widget, {
    kind: 'spinner',
    label,
    status,
    marker: spinnerMarker(widget, theme, status),
    showRunningStatus: false
  }))]);
}

export function spinnerText(widget: SpinnerNode, theme: TerminalTheme): string {
  return blockText(spinnerBlock(widget, theme));
}

export function feedbackStatusMarkerSpan(
  widget: FeedbackNode,
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
  });
}

export function feedbackTextSpan(
  widget: FeedbackNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(widget, 'value')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, style });
}

export function feedbackStructureSpan(
  widget: FeedbackNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(widget, 'marker')
): RenderSpan {
  return feedbackSpan(widget, text, { kind, label, role: 'decoration', style });
}

export function blockText(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

function statusLineSpans(
  widget: FeedbackNode,
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
  widget: FeedbackNode,
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
    }),
    feedbackStructureSpan(widget, ')', kind, 'status.close')
  ];
}

function spinnerMarker(widget: SpinnerNode, theme: TerminalTheme, status: ProcessStatus): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(widget, theme);
  const frameIndex = numberProp(widget, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.tokens.symbols.statusInfo;
}

function spinnerFrames(widget: SpinnerNode, theme: TerminalTheme): readonly string[] {
  const frames = widget.props.frames;
  if (!Array.isArray(frames)) return theme.tokens.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.tokens.symbols.spinnerFrames : cleaned;
}

function helpGroups(widget: HelpBarNode): readonly HelpGroup[] {
  if (!Array.isArray(widget.props.groups)) return [];
  return widget.props.groups.flatMap((group): readonly HelpGroup[] => {
    if (typeof group !== 'object' || group === null) return [];
    const candidate = group as Partial<HelpGroup>;
    if (typeof candidate.id !== 'string' || !Array.isArray(candidate.bindings)) return [];
    const bindings = candidate.bindings.flatMap((binding): readonly { readonly key: string; readonly label: string }[] =>
      typeof binding === 'object'
      && binding !== null
      && typeof (binding as { readonly key?: unknown }).key === 'string'
      && typeof (binding as { readonly label?: unknown }).label === 'string'
        ? [{
            key: sanitizeTerminalText((binding as { readonly key: string }).key).text,
            label: sanitizeTerminalText((binding as { readonly label: string }).label).text
          }]
        : []
    );
    return [{
      id: sanitizeTerminalText(candidate.id).text,
      ...(typeof candidate.label === 'string' ? { label: sanitizeTerminalText(candidate.label).text } : {}),
      bindings
    }];
  });
}

export function feedbackSpan(
  widget: FeedbackNode,
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

function feedbackBarValueStyle(widget: FeedbackNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(widget, 'value')
  );
}

function feedbackBarSeparatorStyle(widget: FeedbackNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(widget, 'marker')
  );
}
