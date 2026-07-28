import type { AccessibleNode } from '../../../../accessibility/index.ts';
import type { RenderNode, RenderNodeOfKind } from '../../../model/index.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../../../visual/source.ts';
import { stringify } from '../../render-node-props.ts';
import { clipRenderSpans, measureRenderSpans, padRenderLine } from '../../../../visual/render.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../../../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from '../../render-node-style.ts';
import { clampRect, emptyRect } from './common.ts';
import type { Rect } from '../../../model/layout.ts';
import type { HitTarget } from '../../../model/renderer.ts';
import type { TabAction } from '../../../../ui-model/tabs.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import { oneCellGlyph } from '../../../../text/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';
import { interactionVisualState, renderNodeTargetId } from '../../pointer-interaction.ts';
import type { ElementVisualState } from '../../../../element/metadata.ts';
import { isInlineContent } from '../../../../visual/inline-content.ts';
import type { InlineContent } from '../../../../visual/inline-content.ts';
import { renderInlineContent } from '../../inline-content.ts';

type TabsNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'tabs'>;

interface TabItemView {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly badge?: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly closable?: boolean;
}

interface TabHeaderMetrics {
  readonly tab: TabItemView;
  readonly spans: readonly RenderSpan[];
  readonly width: number;
  readonly bodyWidth: number;
  readonly closeOffset?: number;
}

interface VisibleTabHeader extends TabHeaderMetrics {
  readonly offset: number;
}

interface TabHeaderLayout {
  readonly spans: readonly RenderSpan[];
  readonly visibleTabs: readonly VisibleTabHeader[];
}

export function tabsChildBounds(renderNode: TabsNode, bounds: Rect): readonly Rect[] {
  const tabs = tabItems(renderNode);
  const selected = selectedTabIndex(renderNode, tabs);
  const headerRows = Math.min(1, bounds.height);
  const panelBounds = clampRect({
    row: bounds.row + headerRows,
    column: bounds.column,
    width: bounds.width,
    height: bounds.height - headerRows
  });
  return (renderNode.children ?? []).map((_child, index) => index === selected ? panelBounds : emptyRect(bounds));
}

export function tabsHeaderText(renderNode: TabsNode, theme: TerminalTheme, widthProfile: TextWidthProfile): string {
  const tabs = tabItems(renderNode);
  const selected = selectedTabIndex(renderNode, tabs);
  return tabs.map((tab, index) => tabHeaderSpans(
    renderNode,
    tab,
    index === selected,
    false,
    theme,
    widthProfile
  ).spans.map((span) => span.text).join('')).join(' ');
}

export function tabsHeaderBlock(
  renderNode: TabsNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  if (bounds.height <= 0 || bounds.width <= 0) return { lines: [] };
  const layout = tabHeaderLayout(renderNode, bounds.width, focused, theme, widthProfile);
  return { lines: [paddedTabHeaderLine(renderNode, layout.spans, bounds.width, widthProfile)] };
}

export function tabsAccessibleChildren(
  renderNode: TabsNode,
  panelChildren: readonly AccessibleNode[]
): readonly AccessibleNode[] {
  const tabs = tabItems(renderNode);
  const selected = selectedTabIndex(renderNode, tabs);
  const rootId = renderNode.id ?? 'tabs';
  const selectedChild = renderNode.children?.[selected];
  const selectedChildIndex = (renderNode.children ?? [])
    .slice(0, selected)
    .filter((child) => !hasDecorativeAccessibility(child))
    .length;
  const selectedPanelChild = selectedChild !== undefined && hasDecorativeAccessibility(selectedChild)
    ? undefined
    : panelChildren[selectedChildIndex];
  const tabNodes = tabs.map((tab, index): AccessibleNode => ({
    id: tabAccessibleId(rootId, tab.id),
    role: 'tab',
    label: tab.label,
    ...(tab.badge === undefined ? {} : { value: tab.badge }),
    ...(tab.description === undefined ? {} : { description: tab.description }),
    selected: index === selected,
    disabled: tab.disabled === true,
    controls: tabPanelAccessibleId(rootId, tab.id),
    ...(tab.closable !== true || tab.disabled === true
      ? {}
      : {
          children: [{
            id: tabCloseTargetId(renderNode, tab.id),
            role: 'button' as const,
            label: `Close ${tab.label}`
          }]
        })
  }));
  const panels = tabs.map((tab, index): AccessibleNode => ({
    id: tabPanelAccessibleId(rootId, tab.id),
    role: 'tabpanel',
    label: tab.label,
    labelledBy: tabAccessibleId(rootId, tab.id),
    ...(index !== selected || selectedPanelChild === undefined
      ? {}
      : { children: [selectedPanelChild] })
  }));
  return [{
    id: `${rootId}:tablist`,
    role: 'tablist',
    label: rootId,
    children: tabNodes
  }, ...panels];
}

function hasDecorativeAccessibility(renderNode: RenderNode): boolean {
  const accessibility = renderNode.accessibility;
  return accessibility !== undefined
    && 'decorative' in accessibility
    && accessibility.decorative;
}

function tabAccessibleId(rootId: string, tabId: string): string {
  return `${rootId}:${tabId}`;
}

function tabPanelAccessibleId(rootId: string, tabId: string): string {
  return `${rootId}:${tabId}:panel`;
}

export function tabsHitTargets<TMessage>(
  renderNode: TabsNode<TMessage>,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  if (bounds.height <= 0 || bounds.width <= 0) return [];
  const toMessage = tabActionMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const layout = tabHeaderLayout(renderNode, bounds.width, false, theme, widthProfile);
  const targetHeight = Math.min(1, bounds.height);
  const targets: HitTarget<TMessage>[] = [];
  for (const metrics of layout.visibleTabs) {
    const tab = metrics.tab;
    const column = bounds.column + metrics.offset;
    if (tab.disabled !== true) {
      const width = Math.min(metrics.bodyWidth, Math.max(0, bounds.column + bounds.width - column));
      if (width > 0) {
        targets.push({
          id: tabTargetId(renderNode, tab.id),
          bounds: {
            row: bounds.row,
            column,
            width,
            height: targetHeight
          },
          message: () => toMessage({ kind: 'select', id: tab.id }),
          cursor: 'pointer'
        });
      }
    }
    if (tab.disabled !== true && tab.closable === true && metrics.closeOffset !== undefined) {
      const closeColumn = column + metrics.closeOffset;
      const width = Math.min(metrics.width - metrics.closeOffset, Math.max(0, bounds.column + bounds.width - closeColumn));
      if (width <= 0) continue;
      targets.push({
        id: tabCloseTargetId(renderNode, tab.id),
        bounds: {
          row: bounds.row,
          column: closeColumn,
          width,
          height: targetHeight
        },
        message: () => toMessage({ kind: 'close', id: tab.id }),
        cursor: 'pointer'
      });
    }
  }
  return targets;
}

function paddedTabHeaderLine(
  renderNode: TabsNode,
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile
): RenderLine {
  return padRenderLine({ spans }, width, {
    widthProfile,
    fill: {
      text: ' ',
      style: tabStripStyle(renderNode),
      source: renderNodeFrameSource(renderNode, {
        rendererFamily: 'layout',
        cellRole: 'decoration',
        partName: 'header.background',
        partType: 'background',
        description: 'header.background'
      })
    }
  });
}

function tabItems(renderNode: TabsNode): readonly TabItemView[] {
  if (!Array.isArray(renderNode.props.tabs)) return [];
  return renderNode.props.tabs.filter((tab): tab is {
    readonly id: string;
    readonly label: string;
    readonly leading?: InlineContent;
    readonly badge?: string;
    readonly description?: string;
    readonly disabled?: boolean;
    readonly closable?: boolean;
  } =>
    typeof tab === 'object'
    && tab !== null
    && typeof (tab as { readonly id?: unknown }).id === 'string'
    && typeof (tab as { readonly label?: unknown }).label === 'string'
  ).map((tab) => ({
    id: stringify(tab.id),
    label: stringify(tab.label),
    ...(isInlineContent(tab.leading) ? { leading: tab.leading } : {}),
    ...(
      typeof tab.badge === 'string' && tab.badge.length > 0
        ? { badge: stringify(tab.badge) }
        : {}
    ),
    ...(
      typeof tab.description === 'string' && tab.description.length > 0
        ? { description: stringify(tab.description) }
        : {}
    ),
    ...(tab.disabled === undefined ? {} : { disabled: tab.disabled }),
    ...(tab.closable === undefined ? {} : { closable: tab.closable })
  }));
}

function tabActionMessageFactory<TMessage>(renderNode: TabsNode<TMessage>): ((action: TabAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

function tabHeaderLayout(
  renderNode: TabsNode,
  width: number,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): TabHeaderLayout {
  if (width <= 0) return { spans: [], visibleTabs: [] };
  const tabs = tabItems(renderNode);
  if (tabs.length === 0) return { spans: [], visibleTabs: [] };
  const selected = selectedTabIndex(renderNode, tabs);
  const entries = tabs.map((tab, index): TabHeaderMetrics => ({
    tab,
    ...tabHeaderSpans(renderNode, tab, index === selected, focused && index === selected, theme, widthProfile)
  }));
  let start = selected;
  let end = selected;
  const selectedEntry = tabHeaderEntry(entries, selected);

  const fits = (nextStart: number, nextEnd: number): boolean =>
    tabRangeWidth(entries, nextStart, nextEnd) + overflowMarkerWidth(nextStart > 0) + overflowMarkerWidth(nextEnd < entries.length - 1) <= width;

  if (!fits(start, end) && selectedEntry.width > width) {
    return {
      spans: clipRenderSpans(selectedEntry.spans, width, { ellipsis: '…', widthProfile }),
      visibleTabs: [{ ...selectedEntry, offset: 0 }]
    };
  }

  for (;;) {
    const growLeft = start > 0 && fits(start - 1, end);
    if (growLeft) {
      start -= 1;
      continue;
    }
    const growRight = end < entries.length - 1 && fits(start, end + 1);
    if (growRight) {
      end += 1;
      continue;
    }
    break;
  }

  const visibleTabs: VisibleTabHeader[] = [];
  const spans: RenderSpan[] = [];
  let offset = 0;
  if (start > 0) {
    spans.push(tabOverflowSpan(renderNode, '… ', 'overflow.leading'));
    offset += 2;
  }
  for (let index = start; index <= end; index += 1) {
    const entry = tabHeaderEntry(entries, index);
    if (index > start) {
      spans.push(tabSpan(
        renderNode,
        ' ',
        mergeStyles(tabStripStyle(renderNode), renderNodeStyle(renderNode, 'label', 'disabled')),
        entry.tab.id,
        'separator',
        'separator'
      ));
      offset += 1;
    }
    visibleTabs.push({ ...entry, offset });
    spans.push(...entry.spans);
    offset += entry.width;
  }
  if (end < entries.length - 1) {
    spans.push(tabOverflowSpan(renderNode, ' …', 'overflow.trailing'));
  }
  return {
    spans: clipRenderSpans(spans, width, { ellipsis: '…', widthProfile }),
    visibleTabs
  };
}

function tabRangeWidth(entries: readonly TabHeaderMetrics[], start: number, end: number): number {
  let width = 0;
  for (let index = start; index <= end; index += 1) {
    width += tabHeaderEntry(entries, index).width;
    if (index > start) width += 1;
  }
  return width;
}

function tabHeaderEntry(entries: readonly TabHeaderMetrics[], index: number): TabHeaderMetrics {
  const entry = entries[index];
  if (entry === undefined) throw new RangeError('tab header entry index is out of range.');
  return entry;
}

function overflowMarkerWidth(visible: boolean): number {
  return visible ? 2 : 0;
}

function selectedTabIndex(renderNode: TabsNode, tabs: readonly { readonly id: string }[]): number {
  const selected = stringify(renderNode.props.selected);
  const index = selected.length === 0 ? 0 : tabs.findIndex((tab) => tab.id === selected);
  return Math.max(0, index === -1 ? 0 : index);
}

function tabHeaderStyle(renderNode: TabsNode, state: ElementVisualState | undefined, selected: boolean): TerminalStyle | undefined {
  const surface = selected ? selectedTabSurfaceStyle() : tabStripStyle(renderNode);
  if (selected && state === 'selected') {
    return mergeStyles(
      surface,
      themeStyle('tab.active.foreground', { bold: true }),
      renderNode.styles?.parts?.['label'],
      renderNode.styles?.states?.selected
    );
  }
  return resolveRenderNodeStyle(renderNode, {
    part: 'label',
    base: mergeStyles(
      surface,
      selected ? themeStyle('tab.active.foreground', { bold: true }) : themeStyle('tab.inactive.foreground')
    ) ?? surface,
    ...(state === undefined ? {} : { state })
  });
}

function tabBadgeStyle(renderNode: TabsNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'badge.foreground' },
      bg: { kind: 'theme', token: 'badge.background' },
      bold: true
    },
    renderNode.styles?.parts?.['badge'],
    state === undefined || state === 'default' ? undefined : renderNode.styles?.states?.[state]
  );
}

function tabCloseStyle(
  renderNode: TabsNode,
  state: ElementVisualState | undefined,
  selected: boolean
): TerminalStyle | undefined {
  return mergeStyles(
    selected ? selectedTabSurfaceStyle() : tabStripStyle(renderNode),
    themeStyle(selected ? 'tab.active.foreground' : 'tab.inactive.foreground', selected ? {} : { dim: true }),
    renderNodeStyle(renderNode, 'close'),
    state === undefined ? undefined : renderNodeStyle(renderNode, 'close', state)
  );
}

function tabHeaderSpans(
  renderNode: TabsNode,
  tab: {
    readonly id: string;
    readonly label: string;
    readonly leading?: InlineContent;
    readonly badge?: string;
    readonly disabled?: boolean;
    readonly closable?: boolean;
  },
  selected: boolean,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): { readonly spans: readonly RenderSpan[]; readonly width: number; readonly bodyWidth: number; readonly closeOffset?: number } {
  const disabled = tab.disabled === true;
  const state = interactionVisualState(renderNode, tabTargetId(renderNode, tab.id), {
    disabled,
    selected,
    focused: focused && selected
  });
  const closeState = interactionVisualState(renderNode, tabCloseTargetId(renderNode, tab.id), {
    disabled
  });
  const style = tabHeaderStyle(renderNode, state, selected);
  const markerStyle = selected ? tabIndicatorStyle(renderNode, state) : style;
  const closeStyle = tabCloseStyle(renderNode, closeState, selected);
  const badge = tab.badge;
  const indicatorSpans = [
    tabSpan(
      renderNode,
      selected ? oneCellGlyph('▏', '|', { widthProfile }) : ' ',
      markerStyle,
      tab.id,
      'indicator',
      'decoration',
      'indicator',
      state
    )
  ];
  const bodySpans = [
    ...tabLeadingSpans(renderNode, tab, state, style, theme),
    ...(tab.leading === undefined ? [] : [tabSpan(renderNode, ' ', style, tab.id, 'leading.separator', 'separator', 'leading', state)]),
    tabSpan(renderNode, tab.label, style, tab.id, 'label', 'text', 'label', state),
    ...(badge === undefined
      ? []
      : [
          tabSpan(renderNode, ' ', style, tab.id, 'badge.separator', 'separator', 'separator', state),
          tabSpan(renderNode, badge, tabBadgeStyle(renderNode, state), tab.id, 'badge', 'text', 'badge', state)
        ]),
  ];
  const closeSeparatorSpans = tab.closable !== true
    ? []
    : [tabSpan(renderNode, ' ', closeStyle, tab.id, 'close.separator', 'separator', 'separator', closeState)];
  const closeSpans = tab.closable !== true
    ? []
    : [
        tabSpan(
          renderNode,
          oneCellGlyph('×', 'x', { widthProfile }),
          closeStyle,
          tab.id,
          'close',
          'text',
          'close',
          closeState
        )
      ];
  const endSpans = [tabSpan(renderNode, ' ', style, tab.id, 'padding.trailing', 'separator', 'separator', state)];
  const naturalSpans = [...indicatorSpans, ...bodySpans, ...closeSeparatorSpans, ...closeSpans, ...endSpans];
  const maxTabWidth = typeof renderNode.props.maxTabWidth === 'number'
    ? Math.max(1, Math.floor(renderNode.props.maxTabWidth))
    : undefined;
  const spans = maxTabWidth === undefined
    ? naturalSpans
    : constrainedTabSpans({
        indicatorSpans,
        bodySpans,
        closeSeparatorSpans,
        closeSpans,
        endSpans,
        maxWidth: maxTabWidth,
        widthProfile
      });
  const width = measureRenderSpans(spans, { widthProfile });
  const closeIndex = spans.findIndex((current) => current.source?.partName === 'close');
  const closeOffset = closeIndex === -1
    ? undefined
    : measureRenderSpans(spans.slice(0, closeIndex), { widthProfile });
  return {
    spans,
    width,
    bodyWidth: closeOffset ?? width,
    ...(closeOffset === undefined ? {} : { closeOffset })
  };
}

function constrainedTabSpans(input: {
  readonly indicatorSpans: readonly RenderSpan[];
  readonly bodySpans: readonly RenderSpan[];
  readonly closeSeparatorSpans: readonly RenderSpan[];
  readonly closeSpans: readonly RenderSpan[];
  readonly endSpans: readonly RenderSpan[];
  readonly maxWidth: number;
  readonly widthProfile: TextWidthProfile;
}): readonly RenderSpan[] {
  const close = clipRenderSpans(input.closeSpans, input.maxWidth, {
    widthProfile: input.widthProfile
  });
  let remaining = input.maxWidth - measureRenderSpans(close, { widthProfile: input.widthProfile });
  const indicator = clipRenderSpans(input.indicatorSpans, Math.max(0, remaining), {
    widthProfile: input.widthProfile
  });
  remaining -= measureRenderSpans(indicator, { widthProfile: input.widthProfile });
  const trailing = remaining > 0 ? input.endSpans : [];
  if (trailing.length > 0) remaining -= measureRenderSpans(trailing, { widthProfile: input.widthProfile });
  const closeSeparator = close.length > 0 && remaining > 0 ? input.closeSeparatorSpans : [];
  if (closeSeparator.length > 0) {
    remaining -= measureRenderSpans(closeSeparator, { widthProfile: input.widthProfile });
  }
  const body = clipRenderSpans(input.bodySpans, Math.max(0, remaining), {
    ellipsis: '…',
    widthProfile: input.widthProfile
  });
  return [...indicator, ...body, ...closeSeparator, ...close, ...trailing];
}

function tabLeadingSpans(
  renderNode: TabsNode,
  tab: { readonly id: string; readonly leading?: InlineContent },
  state: ElementVisualState | undefined,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (tab.leading === undefined) return [];
  const leadingStyle = mergeStyles(
    style,
    renderNode.styles?.parts?.['leading'],
    state === undefined || state === 'default' ? undefined : renderNode.styles?.states?.[state]
  );
  return renderInlineContent(tab.leading, {
    theme,
    ...(leadingStyle === undefined ? {} : { baseStyle: leadingStyle }),
    source: (_segment, index) => renderNodeFrameSource(renderNode, {
      rendererFamily: 'layout',
      cellRole: 'text',
      partName: `leading.${String(index)}`,
      partType: 'leading',
      itemId: tab.id,
      ...(isFrameCellInteractionState(state) ? { interactionState: state } : {}),
      description: `leading.${String(index)}`
    })
  });
}

function tabIndicatorStyle(renderNode: TabsNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    selectedTabSurfaceStyle(),
    themeStyle('tab.indicator', { bold: true }),
    renderNode.styles?.parts?.['indicator'],
    state === undefined || state === 'default' ? undefined : renderNode.styles?.states?.[state]
  );
}

function tabSpan(
  renderNode: TabsNode,
  text: string,
  style: TerminalStyle | undefined,
  itemId: string,
  label: string,
  role: 'decoration' | 'separator' | 'text',
  partType?: string,
  state?: ElementVisualState
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'layout',
      cellRole: role,
      partName: label,
      ...(partType === undefined ? {} : { partType }),
      itemId,
      ...(isFrameCellInteractionState(state) ? { interactionState: state } : {}),
      description: label
    })
  };
}

function tabTargetId(renderNode: TabsNode, tabId: string): string {
  return renderNodeTargetId(renderNode, 'tab', tabId);
}

function tabCloseTargetId(renderNode: TabsNode, tabId: string): string {
  return renderNodeTargetId(renderNode, 'tab', tabId, 'close');
}

function tabOverflowSpan(renderNode: TabsNode, text: string, part: 'overflow.leading' | 'overflow.trailing'): RenderSpan {
  const style = mergeStyles(tabStripStyle(renderNode), renderNodeStyle(renderNode, 'overflow'));
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      rendererFamily: 'layout',
      cellRole: 'decoration',
      partName: part,
      partType: 'overflow',
      description: part
    })
  };
}

function tabStripStyle(renderNode: TabsNode): TerminalStyle {
  return {
    bg: { kind: 'theme', token: 'surface.background' },
    ...renderNode.styles?.root
  };
}

function selectedTabSurfaceStyle(): TerminalStyle {
  return {
    bg: { kind: 'theme', token: 'surface.raised.background' }
  };
}
