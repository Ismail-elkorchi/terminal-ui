import type { RenderNodeOfKind, RenderNodesOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { HelpGroup, ProcessStatus } from '../../ui-model/contracts.ts';
import type { StatusBarItem, StatusBarSection } from '../../ui-model/feedback.ts';
import { normalizeProcessStatus, normalizeStatusBarStatus } from '../../ui-model/status.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import { block, clipRenderSpans, line, measureRenderSpans, span } from '../../visual/render.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { FrameCellRole } from './frame-passes/index.ts';
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
  readonly role?: FrameCellRole | undefined;
  readonly sourceId?: string | undefined;
  readonly state?: import('../../visual/source.ts').FrameCellSource['interactionState'] | undefined;
}

export function statusBarBlock(
  renderNode: StatusBarNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  maxCells?: number
): RenderBlock {
  const leading = statusBarSectionSpans(renderNode, 'leading', statusBarItems(renderNode.props.leading), theme);
  const center = statusBarSectionSpans(renderNode, 'center', statusBarItems(renderNode.props.center), theme);
  const trailing = statusBarSectionSpans(renderNode, 'trailing', statusBarItems(renderNode.props.trailing), theme);
  return block([line(maxCells === undefined
    ? joinedStatusBarSections(renderNode, [leading, center, trailing])
    : placedStatusBarSections(renderNode, leading, center, trailing, maxCells, widthProfile))]);
}

export function statusBarText(renderNode: StatusBarNode, theme: TerminalTheme, widthProfile: TextWidthProfile): string {
  return blockText(statusBarBlock(renderNode, theme, widthProfile));
}

export function statusBarAccessibleText(renderNode: StatusBarNode): string {
  return [renderNode.props.leading, renderNode.props.center, renderNode.props.trailing]
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
      return [{ id, kind: 'status', text, status: normalizeStatusBarStatus(candidate.status), ...adornments }];
    }
    return candidate.kind === 'text' ? [{ id, kind: 'text', text, ...adornments }] : [];
  });
}

function statusBarSectionSpans(
  renderNode: StatusBarNode,
  section: StatusBarSection,
  items: readonly StatusBarItem[],
  theme: TerminalTheme
): readonly RenderSpan[] {
  return items.flatMap((item, index): readonly RenderSpan[] => {
    const part = `${section}.${item.id}`;
    const leading = statusInlineSpans(renderNode, item.leading, `${part}.leading`, 'leading', item.id, theme);
    const trailing = statusInlineSpans(renderNode, item.trailing, `${part}.trailing`, 'trailing', item.id, theme);
    const contentSpans = item.kind === 'status'
      ? [
          feedbackSpan(renderNode, statusMarker(item.status, theme), {
            kind: 'statusBar',
            label: `${part}.marker`,
            sourceId: item.id,
            style: statusStyle(item.status),
          }),
          feedbackSpan(renderNode, ' ', {
            kind: 'statusBar',
            label: `${part}.gap`,
            sourceId: item.id,
            role: 'separator',
            style: feedbackBarSeparatorStyle(renderNode)
          }),
          feedbackSpan(renderNode, item.text, {
            kind: 'statusBar',
            label: `${part}.value`,
            sourceId: item.id,
            style: statusStyle(item.status),
          })
        ]
      : [feedbackSpan(renderNode, item.text, {
          kind: 'statusBar',
          label: `${part}.value`,
          sourceId: item.id,
          style: feedbackBarValueStyle(renderNode)
        })];
    const itemSpans = [
      ...leading,
      ...(leading.length === 0 ? [] : [statusBarGap(renderNode, `${part}.leading.separator`)]),
      ...contentSpans,
      ...(trailing.length === 0 ? [] : [statusBarGap(renderNode, `${part}.trailing.separator`)]),
      ...trailing
    ];
    return index === 0
      ? itemSpans
      : [statusBarGap(renderNode, `${section}.separator.${String(index)}`), ...itemSpans];
  });
}

function statusInlineSpans(
  renderNode: StatusBarNode,
  content: InlineContent | undefined,
  part: string,
  stylePart: 'leading' | 'trailing',
  itemId: string,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (content === undefined) return [];
  const baseStyle = mergeStyles(feedbackBarValueStyle(renderNode), renderNode.styles?.parts?.[stylePart]);
  return renderInlineContent(content, {
    theme,
    ...(baseStyle === undefined ? {} : { baseStyle }),
    source: (_segment, index) => renderNodeFrameSource(renderNode, {
      rendererFamily: 'feedback',
      cellRole: 'text',
      partName: `${part}.${String(index)}`,
      partType: stylePart,
      itemId,
      description: `${part}.${String(index)}`
    })
  });
}

function joinedStatusBarSections(
  renderNode: StatusBarNode,
  sections: readonly (readonly RenderSpan[])[]
): readonly RenderSpan[] {
  const visible = sections.filter((section) => section.length > 0);
  return visible.flatMap((section, index): readonly RenderSpan[] =>
    index === 0 ? section : [statusBarGap(renderNode, `section.separator.${String(index)}`), ...section]
  );
}

function placedStatusBarSections(
  renderNode: StatusBarNode,
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
    if (placement.start > column) output.push(statusBarFill(renderNode, placement.start - column));
    output.push(...placement.spans);
    column = placement.start + measureRenderSpans(placement.spans, { widthProfile });
  }
  if (column < maxCells) output.push(statusBarFill(renderNode, maxCells - column));
  return output;
}

function statusBarGap(renderNode: StatusBarNode, label: string): RenderSpan {
  return feedbackSpan(renderNode, '  ', {
    kind: 'statusBar',
    label,
    role: 'separator',
    style: feedbackBarSeparatorStyle(renderNode)
  });
}

function statusBarFill(renderNode: StatusBarNode, cells: number): RenderSpan {
  return feedbackSpan(renderNode, ' '.repeat(cells), {
    kind: 'statusBar',
    label: 'fill',
    role: 'decoration',
    style: feedbackBarValueStyle(renderNode)
  });
}

export function helpBarBlock(renderNode: HelpBarNode, widthProfile: TextWidthProfile, maxCells?: number): RenderBlock {
  const spans = fitHelpGroupSpans(renderNode, helpGroups(renderNode), maxCells, widthProfile);
  return block([line(spans)]);
}

function fitHelpGroupSpans(
  renderNode: HelpBarNode,
  groups: readonly HelpGroup[],
  maxCells: number | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  if (maxCells === undefined) return groups.flatMap((group, index) => helpGroupSpans(renderNode, group, index, index > 0));
  const fitted: RenderSpan[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group === undefined) continue;
    const groupSpans = helpGroupSpans(renderNode, group, groupIndex, fitted.length > 0);
    if (measureRenderSpans([...fitted, ...groupSpans], { widthProfile }) <= maxCells) {
      fitted.push(...groupSpans);
      continue;
    }
    appendPartialHelpGroup(renderNode, fitted, group, groupIndex, maxCells, widthProfile);
    appendHelpOverflow(renderNode, fitted, maxCells, widthProfile);
    break;
  }
  return fitted;
}

function helpGroupSpans(
  renderNode: HelpBarNode,
  group: HelpGroup,
  groupIndex: number,
  separated: boolean
): readonly RenderSpan[] {
  const prefix = helpGroupPrefixSpans(renderNode, group, groupIndex, separated);
  return [
    ...prefix,
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] =>
      helpBindingSpans(renderNode, binding, group.id, bindingIndex, group.label !== undefined || bindingIndex > 0)
    )
  ];
}

function helpGroupPrefixSpans(
  renderNode: HelpBarNode,
  group: HelpGroup,
  groupIndex: number,
  separated: boolean
): readonly RenderSpan[] {
  return [
    ...(separated ? [feedbackSpan(renderNode, '  ', {
      kind: 'helpBar',
      label: `group.${group.id}.separator`,
      role: 'separator',
      style: feedbackBarSeparatorStyle(renderNode)
    })] : []),
    ...(group.label === undefined ? [] : [
      feedbackSpan(renderNode, group.label, {
        kind: 'helpBar',
        label: `group.${group.id}.label`,
        sourceId: group.id,
        style: renderNodeStyle(renderNode, 'label')
      }),
      feedbackSpan(renderNode, ' ', {
        kind: 'helpBar',
        label: `group.${String(groupIndex)}.gap`,
        role: 'separator',
        style: feedbackBarSeparatorStyle(renderNode)
      })
    ])
  ];
}

function helpBindingSpans(
  renderNode: HelpBarNode,
  binding: { readonly key: string; readonly label: string },
  groupId: string,
  index: number,
  separated: boolean
): readonly RenderSpan[] {
  const bindingLabel = `group.${groupId}.binding.${String(index)}`;
  return [
    ...(separated ? [feedbackSpan(renderNode, '  ', {
      kind: 'helpBar',
      label: `${bindingLabel}.separator`,
      role: 'separator',
      style: feedbackBarSeparatorStyle(renderNode)
    })] : []),
    feedbackSpan(renderNode, binding.key, {
      kind: 'helpBar',
      label: `${bindingLabel}.key`,
      sourceId: groupId,
      style: helpKeyStyle(renderNode)
    }),
    feedbackSpan(renderNode, ` ${binding.label}`, {
      kind: 'helpBar',
      label: `${bindingLabel}.label`,
      sourceId: groupId,
      style: feedbackBarValueStyle(renderNode)
    })
  ];
}

function appendPartialHelpGroup(
  renderNode: HelpBarNode,
  fitted: RenderSpan[],
  group: HelpGroup,
  groupIndex: number,
  maxCells: number,
  widthProfile: TextWidthProfile
): void {
  const prefix = helpGroupPrefixSpans(renderNode, group, groupIndex, fitted.length > 0);
  if (measureRenderSpans([...fitted, ...prefix], { widthProfile }) <= maxCells) fitted.push(...prefix);
  for (let index = 0; index < group.bindings.length; index += 1) {
    const binding = group.bindings[index];
    if (binding === undefined) continue;
    const spans = helpBindingSpans(renderNode, binding, group.id, index, group.label !== undefined || index > 0);
    if (measureRenderSpans([...fitted, ...spans], { widthProfile }) > maxCells) break;
    fitted.push(...spans);
  }
}

function helpKeyStyle(renderNode: HelpBarNode): TerminalStyle | undefined {
  return mergeStyles(
    feedbackBarValueStyle(renderNode),
    {
      fg: { kind: 'theme', token: 'keyHint.foreground' },
      bg: { kind: 'theme', token: 'keyHint.background' },
      bold: true
    },
    renderNodeStyle(renderNode, 'label')
  );
}

function appendHelpOverflow(
  renderNode: HelpBarNode,
  fitted: RenderSpan[],
  maxCells: number,
  widthProfile: TextWidthProfile
): void {
  if (maxCells <= 0) return;
  const marker = feedbackSpan(renderNode, '…', {
    kind: 'helpBar',
    label: 'overflow',
    role: 'decoration',
    style: renderNodeStyle(renderNode, 'marker')
  });
  const separatedMarker = fitted.length === 0
    ? [marker]
    : [
        feedbackSpan(renderNode, '  ', {
      kind: 'helpBar',
      label: 'overflow.separator',
      role: 'separator',
      style: feedbackBarSeparatorStyle(renderNode)
    }),
        marker
      ];
  if (measureRenderSpans([...fitted, ...separatedMarker], { widthProfile }) <= maxCells) {
    fitted.push(...separatedMarker);
    return;
  }
  if (fitted.length === 0 && measureRenderSpans([marker], { widthProfile }) <= maxCells) fitted.push(marker);
}

export function helpBarText(renderNode: HelpBarNode, widthProfile: TextWidthProfile): string {
  return blockText(helpBarBlock(renderNode, widthProfile));
}

export function statusIndicatorBlock(renderNode: StatusIndicatorNode, theme: TerminalTheme): RenderBlock {
  const label = stringify(renderNode.props.label) || 'Activity';
  const status = normalizeProcessStatus(renderNode.props.status);
  return block([line(statusLineSpans(renderNode, {
    kind: 'statusIndicator',
    label,
    status,
    marker: statusMarker(status, theme),
    showRunningStatus: true
  }))]);
}

export function statusIndicatorText(renderNode: StatusIndicatorNode, theme: TerminalTheme): string {
  return blockText(statusIndicatorBlock(renderNode, theme));
}

export function spinnerBlock(renderNode: SpinnerNode, theme: TerminalTheme): RenderBlock {
  const status = normalizeProcessStatus(renderNode.props.status, 'running');
  const label = stringify(renderNode.props.label) || 'Loading';
  return block([line(statusLineSpans(renderNode, {
    kind: 'spinner',
    label,
    status,
    marker: spinnerMarker(renderNode, theme, status),
    showRunningStatus: false
  }))]);
}

export function spinnerText(renderNode: SpinnerNode, theme: TerminalTheme): string {
  return blockText(spinnerBlock(renderNode, theme));
}

export function feedbackStatusMarkerSpan(
  renderNode: FeedbackNode,
  kind: FeedbackVisualKind,
  label: string,
  status: ProcessStatus,
  marker: string
): RenderSpan {
  return feedbackSpan(renderNode, marker, {
    kind,
    label,
    role: 'decoration',
    style: statusStyle(status),
  });
}

export function feedbackTextSpan(
  renderNode: FeedbackNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(renderNode, 'value')
): RenderSpan {
  return feedbackSpan(renderNode, text, { kind, label, style });
}

export function feedbackStructureSpan(
  renderNode: FeedbackNode,
  text: string,
  kind: FeedbackVisualKind,
  label: string,
  style: TerminalStyle | undefined = renderNodeStyle(renderNode, 'marker')
): RenderSpan {
  return feedbackSpan(renderNode, text, { kind, label, role: 'decoration', style });
}

export function blockText(currentBlock: RenderBlock): string {
  return currentBlock.lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

function statusLineSpans(
  renderNode: FeedbackNode,
  input: {
    readonly kind: FeedbackVisualKind;
    readonly label: string;
    readonly status: ProcessStatus;
    readonly marker: string;
    readonly showRunningStatus: boolean;
  }
): readonly RenderSpan[] {
  return [
    feedbackStatusMarkerSpan(renderNode, input.kind, 'status.marker', input.status, input.marker),
    feedbackSpan(renderNode, ' ', {
      kind: input.kind,
      label: 'status.gap',
      role: 'separator',
      style: feedbackBarSeparatorStyle(renderNode)
    }),
    feedbackSpan(renderNode, input.label, {
      kind: input.kind,
      label: 'label',
      style: feedbackBarValueStyle(renderNode)
    }),
    ...statusSuffixSpans(renderNode, input.kind, input.status, input.showRunningStatus)
  ];
}

function statusSuffixSpans(
  renderNode: FeedbackNode,
  kind: FeedbackVisualKind,
  status: ProcessStatus,
  showRunningStatus: boolean
): readonly RenderSpan[] {
  if (status === 'idle' || (status === 'running' && !showRunningStatus)) return [];
  return [
    feedbackStructureSpan(renderNode, ' (', kind, 'status.open'),
    feedbackSpan(renderNode, status, {
      kind,
      label: 'status.value',
      style: statusStyle(status),
    }),
    feedbackStructureSpan(renderNode, ')', kind, 'status.close')
  ];
}

function spinnerMarker(renderNode: SpinnerNode, theme: TerminalTheme, status: ProcessStatus): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(renderNode, theme);
  const frameIndex = numberProp(renderNode, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.tokens.symbols.statusInfo;
}

function spinnerFrames(renderNode: SpinnerNode, theme: TerminalTheme): readonly string[] {
  const frames = renderNode.props.frames;
  if (!Array.isArray(frames)) return theme.tokens.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.tokens.symbols.spinnerFrames : cleaned;
}

function helpGroups(renderNode: HelpBarNode): readonly HelpGroup[] {
  if (!Array.isArray(renderNode.props.groups)) return [];
  return renderNode.props.groups.flatMap((group): readonly HelpGroup[] => {
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
  renderNode: FeedbackNode,
  text: string,
  options: FeedbackSpanOptions
): RenderSpan {
  return span(text, {
    ...(options.style === undefined ? {} : { style: options.style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'feedback',
      cellRole: options.role ?? 'text',
      partName: options.label,
      partType: options.kind,
      ...(options.sourceId === undefined ? {} : { itemId: options.sourceId }),
      ...(options.state === undefined ? {} : { interactionState: options.state }),
      description: options.label
    })
  });
}

function feedbackBarValueStyle(renderNode: FeedbackNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(renderNode, 'value')
  );
}

function feedbackBarSeparatorStyle(renderNode: FeedbackNode): TerminalStyle | undefined {
  return mergeStyles(
    {
      bg: { kind: 'theme', token: 'surface.chrome.background' }
    },
    renderNodeStyle(renderNode, 'marker')
  );
}
