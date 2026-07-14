import type { AccessibleNode } from '../../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import { renderNodeFrameSource } from '../../../../visual/source.ts';
import { stringify } from '../../render-node-props.ts';
import { clipRenderSpans, measureRenderSpans } from '../../../../visual/render.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from '../../../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from '../../render-node-style.ts';
import { clampRect, emptyRect } from './common.ts';
import type { Rect } from '../../../model/layout.ts';
import type { HitTarget } from '../../../model/renderer.ts';
import type { TabAction } from '../../../../ui-model/tabs.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import { interactionVisualState, renderNodeTargetId } from '../../pointer-presentation.ts';
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

export function tabsChildBounds(widget: TabsNode, bounds: Rect): readonly Rect[] {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  const panelBounds = clampRect({
    row: bounds.row + 1,
    column: bounds.column,
    width: bounds.width,
    height: bounds.height - 1
  });
  return (widget.children ?? []).map((_child, index) => index === selected ? panelBounds : emptyRect(bounds));
}

export function tabsHeaderText(widget: TabsNode, theme: TerminalTheme): string {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  return tabs.map((tab, index) => tabHeaderSpans(widget, tab, index === selected, false, theme).spans.map((span) => span.text).join('')).join(' ');
}

export function tabsHeaderBlock(widget: TabsNode, bounds: Rect, focused: boolean, theme: TerminalTheme): RenderBlock {
  if (bounds.height <= 0 || bounds.width <= 0) return { lines: [] };
  const layout = tabHeaderLayout(widget, bounds.width, focused, theme);
  return {
    lines: [{
      spans: layout.spans
    }]
  };
}

export function tabsAccessibleChildren(widget: TabsNode): readonly AccessibleNode[] {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  return tabs.map((tab, index) => ({
    id: `${widget.id ?? 'tabs'}:${tab.id}`,
    role: 'menuitem',
    label: tab.label,
    ...(tab.badge === undefined ? {} : { value: tab.badge }),
    ...(tab.description === undefined ? {} : { description: tab.description }),
    selected: index === selected,
    disabled: tab.disabled === true
  }));
}

export function tabsHitTargets<TMessage>(
  widget: TabsNode<TMessage>,
  bounds: Rect,
  theme: TerminalTheme
): readonly HitTarget<TMessage>[] {
  if (bounds.height <= 0 || bounds.width <= 0) return [];
  const toMessage = tabActionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const layout = tabHeaderLayout(widget, bounds.width, false, theme);
  const targets: HitTarget<TMessage>[] = [];
  for (const metrics of layout.visibleTabs) {
    const tab = metrics.tab;
    const column = bounds.column + metrics.offset;
    if (tab.disabled !== true) {
      const width = Math.min(metrics.bodyWidth, Math.max(0, bounds.column + bounds.width - column));
      if (width <= 0) continue;
      targets.push({
        id: tabTargetId(widget, tab.id),
        bounds: {
          row: bounds.row,
          column,
          width,
          height: 1
        },
        message: () => toMessage({ kind: 'select', id: tab.id }),
        cursor: 'pointer'
      });
    }
    if (tab.disabled !== true && tab.closable === true && metrics.closeOffset !== undefined) {
      const closeColumn = column + metrics.closeOffset;
      const width = Math.min(metrics.width - metrics.closeOffset, Math.max(0, bounds.column + bounds.width - closeColumn));
      if (width <= 0) continue;
      targets.push({
        id: tabCloseTargetId(widget, tab.id),
        bounds: {
          row: bounds.row,
          column: closeColumn,
          width,
          height: 1
        },
        message: () => toMessage({ kind: 'close', id: tab.id }),
        cursor: 'pointer'
      });
    }
  }
  return targets;
}

function tabItems(widget: TabsNode): readonly TabItemView[] {
  if (!Array.isArray(widget.props.tabs)) return [];
  return widget.props.tabs.filter((tab): tab is {
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

function tabActionMessageFactory<TMessage>(widget: TabsNode<TMessage>): ((action: TabAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function tabHeaderLayout(widget: TabsNode, width: number, focused: boolean, theme: TerminalTheme): TabHeaderLayout {
  if (width <= 0) return { spans: [], visibleTabs: [] };
  const tabs = tabItems(widget);
  if (tabs.length === 0) return { spans: [], visibleTabs: [] };
  const selected = selectedTabIndex(widget, tabs);
  const entries = tabs.map((tab, index): TabHeaderMetrics => ({
    tab,
    ...tabHeaderSpans(widget, tab, index === selected, focused && index === selected, theme)
  }));
  let start = selected;
  let end = selected;
  const selectedEntry = tabHeaderEntry(entries, selected);

  const fits = (nextStart: number, nextEnd: number): boolean =>
    tabRangeWidth(entries, nextStart, nextEnd) + overflowMarkerWidth(nextStart > 0) + overflowMarkerWidth(nextEnd < entries.length - 1) <= width;

  if (!fits(start, end) && selectedEntry.width > width) {
    return {
      spans: clipRenderSpans(selectedEntry.spans, width, { ellipsis: '…' }),
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
    spans.push(tabOverflowSpan(widget, '… ', 'overflow.leading'));
    offset += 2;
  }
  for (let index = start; index <= end; index += 1) {
    const entry = tabHeaderEntry(entries, index);
    if (index > start) {
      spans.push(tabSpan(widget, ' ', renderNodeStyle(widget, 'label', 'disabled'), entry.tab.id, 'separator', 'separator'));
      offset += 1;
    }
    visibleTabs.push({ ...entry, offset });
    spans.push(...entry.spans);
    offset += entry.width;
  }
  if (end < entries.length - 1) {
    spans.push(tabOverflowSpan(widget, ' …', 'overflow.trailing'));
  }
  return {
    spans: clipRenderSpans(spans, width, { ellipsis: '…' }),
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

function selectedTabIndex(widget: TabsNode, tabs: readonly { readonly id: string }[]): number {
  const selected = stringify(widget.props.selected);
  const index = selected.length === 0 ? 0 : tabs.findIndex((tab) => tab.id === selected);
  return Math.max(0, index === -1 ? 0 : index);
}

function tabHeaderStyle(widget: TabsNode, state: ElementVisualState | undefined, selected: boolean): TerminalStyle | undefined {
  if (selected && state === 'selected') {
    return mergeStyles(
      themeStyle('tab.active.foreground', { underline: true }),
      widget.styles?.parts?.['label'],
      widget.styles?.states?.selected
    );
  }
  return resolveRenderNodeStyle(widget, {
    part: 'label',
    base: selected ? themeStyle('tab.active.foreground', { underline: true }) : themeStyle('tab.inactive.foreground'),
    ...(state === undefined ? {} : { state })
  });
}

function tabBadgeStyle(widget: TabsNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'badge.foreground' },
      bg: { kind: 'theme', token: 'badge.background' },
      bold: true
    },
    widget.styles?.parts?.['badge'],
    state === undefined || state === 'default' ? undefined : widget.styles?.states?.[state]
  );
}

function tabCloseStyle(widget: TabsNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'close'),
    state === undefined ? undefined : renderNodeStyle(widget, 'close', state)
  );
}

function tabHeaderSpans(
  widget: TabsNode,
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
  theme: TerminalTheme
): { readonly spans: readonly RenderSpan[]; readonly width: number; readonly bodyWidth: number; readonly closeOffset?: number } {
  const disabled = tab.disabled === true;
  const state = interactionVisualState(widget, tabTargetId(widget, tab.id), {
    disabled,
    selected,
    focused: focused && selected
  });
  const closeState = interactionVisualState(widget, tabCloseTargetId(widget, tab.id), {
    disabled,
    selected,
    focused: focused && selected
  });
  const style = tabHeaderStyle(widget, state, selected);
  const markerStyle = selected ? tabIndicatorStyle(widget, state) : style;
  const closeStyle = tabCloseStyle(widget, closeState);
  const badge = tab.badge;
  const baseSpans = [
    tabSpan(widget, selected ? '[' : ' ', markerStyle, tab.id, selected ? 'marker.selected.open' : 'marker.unselected.open', 'decoration', 'marker', state),
    ...tabLeadingSpans(widget, tab, state, style, theme),
    ...(tab.leading === undefined ? [] : [tabSpan(widget, ' ', style, tab.id, 'leading.separator', 'separator', 'leading', state)]),
    tabSpan(widget, tab.label, style, tab.id, 'label', 'text', 'label', state),
    ...(badge === undefined
      ? []
      : [
          tabSpan(widget, ' ', style, tab.id, 'badge.separator', 'separator', 'separator', state),
          tabSpan(widget, badge, tabBadgeStyle(widget, state), tab.id, 'badge', 'text', 'badge', state)
        ]),
    ...(tab.closable !== true
      ? []
      : [
          tabSpan(widget, ' ', closeStyle, tab.id, 'close.separator', 'separator', 'separator', closeState)
        ])
  ];
  const closeOffset = tab.closable !== true ? undefined : measureRenderSpans(baseSpans);
  const closeSpans = tab.closable !== true
    ? []
    : [
        tabSpan(widget, '×', closeStyle, tab.id, 'close', 'text', 'close', closeState)
      ];
  const endSpans = [
    tabSpan(widget, selected ? ']' : ' ', markerStyle, tab.id, selected ? 'marker.selected.close' : 'marker.unselected.close', 'decoration', 'marker', state)
  ];
  const spans = [...baseSpans, ...closeSpans, ...endSpans];
  const width = measureRenderSpans(spans);
  return {
    spans,
    width,
    bodyWidth: closeOffset ?? width,
    ...(closeOffset === undefined ? {} : { closeOffset })
  };
}

function tabLeadingSpans(
  widget: TabsNode,
  tab: { readonly id: string; readonly leading?: InlineContent },
  state: ElementVisualState | undefined,
  style: TerminalStyle | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (tab.leading === undefined) return [];
  const leadingStyle = mergeStyles(
    style,
    widget.styles?.parts?.['leading'],
    state === undefined || state === 'default' ? undefined : widget.styles?.states?.[state]
  );
  return renderInlineContent(tab.leading, {
    theme,
    ...(leadingStyle === undefined ? {} : { baseStyle: leadingStyle }),
    source: (_segment, index) => renderNodeFrameSource(widget, {
      family: 'layout',
      role: 'text',
      part: `leading.${String(index)}`,
      partKind: 'leading',
      itemId: tab.id,
      ...(state === undefined ? {} : { state }),
      label: `leading.${String(index)}`
    })
  });
}

function tabIndicatorStyle(widget: TabsNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    themeStyle('tab.indicator', { bold: true }),
    widget.styles?.parts?.['indicator'],
    state === undefined || state === 'default' ? undefined : widget.styles?.states?.[state]
  );
}

function tabSpan(
  widget: TabsNode,
  text: string,
  style: TerminalStyle | undefined,
  itemId: string,
  label: string,
  role: 'decoration' | 'separator' | 'text',
  partKind?: string,
  state?: ElementVisualState
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, {
      family: 'layout',
      role,
      part: label,
      ...(partKind === undefined ? {} : { partKind }),
      itemId,
      ...(state === undefined ? {} : { state }),
      label
    })
  };
}

function tabTargetId(widget: TabsNode, tabId: string): string {
  return renderNodeTargetId(widget, 'tab', tabId);
}

function tabCloseTargetId(widget: TabsNode, tabId: string): string {
  return renderNodeTargetId(widget, 'tab', tabId, 'close');
}

function tabOverflowSpan(widget: TabsNode, text: string, part: 'overflow.leading' | 'overflow.trailing'): RenderSpan {
  const style = renderNodeStyle(widget, 'overflow');
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, {
      family: 'layout',
      role: 'decoration',
      part,
      partKind: 'overflow',
      label: part
    })
  };
}
