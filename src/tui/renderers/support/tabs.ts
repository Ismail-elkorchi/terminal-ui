import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import { widgetFrameSource } from '../../frame-source.ts';
import { stringify } from '../../widget-props.ts';
import { clipRenderSpans, measureRenderSpans } from '../../render-primitives.ts';
import type { RenderBlock, RenderSpan, TerminalStyle } from '../../render-primitives.ts';
import { mergeStyles, themeStyle, widgetStyle } from '../../widget-style.ts';
import { clampRect, emptyRect } from './common.ts';
import type { Rect } from '../../layout.ts';
import type { HitTarget } from '../../widget-renderer.ts';

interface TabItemView {
  readonly id: string;
  readonly label: string;
  readonly badge?: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly message?: unknown;
  readonly closeMessage?: unknown;
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

export function tabsChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
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

export function tabsHeaderText(widget: Widget): string {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  return tabs.map((tab, index) => tabHeaderSpans(widget, tab, index === selected, false).spans.map((span) => span.text).join('')).join(' ');
}

export function tabsHeaderBlock(widget: Widget, bounds: Rect, focused = false): RenderBlock {
  if (bounds.height <= 0 || bounds.width <= 0) return { lines: [] };
  const layout = tabHeaderLayout(widget, bounds.width, focused);
  return {
    lines: [{
      spans: layout.spans
    }]
  };
}

export function tabsAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
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

export function tabsHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (bounds.height <= 0 || bounds.width <= 0) return [];
  const layout = tabHeaderLayout(widget, bounds.width, false);
  const targets: HitTarget<TMessage>[] = [];
  for (const metrics of layout.visibleTabs) {
    const tab = metrics.tab;
    const column = bounds.column + metrics.offset;
    if (tab.disabled !== true && tab.message !== undefined) {
      const width = Math.min(metrics.bodyWidth, Math.max(0, bounds.column + bounds.width - column));
      if (width <= 0) continue;
      targets.push({
        id: `${widget.id ?? 'tabs'}:tab:${tab.id}`,
        bounds: {
          row: bounds.row,
          column,
          width,
          height: 1
        },
        message: () => tab.message as TMessage,
        cursor: 'pointer'
      });
    }
    if (tab.disabled !== true && tab.closeMessage !== undefined && metrics.closeOffset !== undefined) {
      const closeColumn = column + metrics.closeOffset;
      const width = Math.min(metrics.width - metrics.closeOffset, Math.max(0, bounds.column + bounds.width - closeColumn));
      if (width <= 0) continue;
      targets.push({
        id: `${widget.id ?? 'tabs'}:tab:${tab.id}:close`,
        bounds: {
          row: bounds.row,
          column: closeColumn,
          width,
          height: 1
        },
        message: () => tab.closeMessage as TMessage,
        cursor: 'pointer'
      });
    }
  }
  return targets;
}

function tabItems(widget: Widget): readonly TabItemView[] {
  if (!Array.isArray(widget.props['tabs'])) return [];
  return widget.props['tabs'].filter((tab): tab is {
    readonly id: string;
    readonly label: string;
    readonly badge?: string;
    readonly description?: string;
    readonly disabled?: boolean;
    readonly message?: unknown;
    readonly closeMessage?: unknown;
  } =>
    typeof tab === 'object'
    && tab !== null
    && typeof (tab as { readonly id?: unknown }).id === 'string'
    && typeof (tab as { readonly label?: unknown }).label === 'string'
  ).map((tab) => ({
    id: stringify(tab.id),
    label: stringify(tab.label),
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
    ...(tab.message === undefined ? {} : { message: tab.message }),
    ...(tab.closeMessage === undefined ? {} : { closeMessage: tab.closeMessage })
  }));
}

function tabHeaderLayout(widget: Widget, width: number, focused: boolean): TabHeaderLayout {
  if (width <= 0) return { spans: [], visibleTabs: [] };
  const tabs = tabItems(widget);
  if (tabs.length === 0) return { spans: [], visibleTabs: [] };
  const selected = selectedTabIndex(widget, tabs);
  const entries = tabs.map((tab, index): TabHeaderMetrics => ({
    tab,
    ...tabHeaderSpans(widget, tab, index === selected, focused && index === selected)
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
      spans.push(tabSpan(widget, ' ', widgetStyle(widget, 'value', 'disabled'), entry.tab.id, 'separator', 'separator'));
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

function selectedTabIndex(widget: Widget, tabs: readonly { readonly id: string }[]): number {
  const selected = stringify(widget.props['selected']);
  const index = selected.length === 0 ? 0 : tabs.findIndex((tab) => tab.id === selected);
  return Math.max(0, index === -1 ? 0 : index);
}

function tabHeaderStyle(
  widget: Widget,
  state: { readonly selected: boolean; readonly focused: boolean; readonly disabled: boolean }
): TerminalStyle | undefined {
  if (state.disabled) return widgetStyle(widget, 'value', 'disabled');
  if (state.selected && state.focused) {
    return mergeStyles(
      widgetStyle(widget, 'value', 'selected'),
      themeStyle('tab.active.foreground'),
      widget.styles?.selected,
      widgetStyle(widget, 'value', 'focused'),
      widget.styles?.focused
    );
  }
  if (state.selected) return mergeStyles(widgetStyle(widget, 'value', 'selected'), themeStyle('tab.active.foreground'), widget.styles?.selected);
  if (state.focused) return mergeStyles(themeStyle('tab.inactive.foreground'), widgetStyle(widget, 'value', 'focused'));
  return mergeStyles(themeStyle('tab.inactive.foreground'), widgetStyle(widget, 'value'));
}

function tabBadgeStyle(widget: Widget, selected: boolean, disabled: boolean, focused: boolean): TerminalStyle | undefined {
  return mergeStyles(
    selected ? widgetStyle(widget, 'value', 'selected') : undefined,
    {
      fg: { kind: 'theme', token: 'badge.foreground' },
      bg: { kind: 'theme', token: 'badge.background' },
      bold: true
    },
    disabled ? widgetStyle(widget, 'value', 'disabled') : undefined,
    focused ? widgetStyle(widget, 'value', 'focused') : undefined
  );
}

function tabCloseStyle(widget: Widget, selected: boolean, disabled: boolean, focused: boolean): TerminalStyle | undefined {
  return mergeStyles(
    widgetStyle(widget, 'placeholder'),
    selected ? widgetStyle(widget, 'value', 'selected') : undefined,
    disabled ? widgetStyle(widget, 'value', 'disabled') : undefined,
    focused ? widgetStyle(widget, 'value', 'focused') : undefined
  );
}

function tabHeaderSpans(
  widget: Widget,
  tab: {
    readonly id: string;
    readonly label: string;
    readonly badge?: string;
    readonly disabled?: boolean;
    readonly closeMessage?: unknown;
  },
  selected: boolean,
  focused: boolean
): { readonly spans: readonly RenderSpan[]; readonly width: number; readonly bodyWidth: number; readonly closeOffset?: number } {
  const disabled = tab.disabled === true;
  const style = tabHeaderStyle(widget, { disabled, focused, selected });
  const closeStyle = tabCloseStyle(widget, selected, disabled, focused);
  const badge = tab.badge;
  const baseSpans = [
    tabSpan(widget, selected ? '[' : ' ', style, tab.id, selected ? 'marker.selected.open' : 'marker.unselected.open', 'decoration', 'marker', stateForTab(selected, disabled, focused)),
    tabSpan(widget, tab.label, style, tab.id, 'label', 'text', 'label', stateForTab(selected, disabled, focused)),
    ...(badge === undefined
      ? []
      : [
          tabSpan(widget, ' ', style, tab.id, 'badge.separator', 'separator', 'separator', stateForTab(selected, disabled, focused)),
          tabSpan(widget, badge, tabBadgeStyle(widget, selected, disabled, focused), tab.id, 'badge', 'text', 'badge', stateForTab(selected, disabled, focused))
        ]),
    ...(tab.closeMessage === undefined
      ? []
      : [
          tabSpan(widget, ' ', closeStyle, tab.id, 'close.separator', 'separator', 'separator', stateForTab(selected, disabled, focused))
        ])
  ];
  const closeOffset = tab.closeMessage === undefined ? undefined : measureRenderSpans(baseSpans);
  const closeSpans = tab.closeMessage === undefined
    ? []
    : [
        tabSpan(widget, '×', closeStyle, tab.id, 'close', 'text', 'close', stateForTab(selected, disabled, focused))
      ];
  const endSpans = [
    tabSpan(widget, selected ? ']' : ' ', style, tab.id, selected ? 'marker.selected.close' : 'marker.unselected.close', 'decoration', 'marker', stateForTab(selected, disabled, focused))
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

function stateForTab(selected: boolean, disabled: boolean, focused: boolean): string | undefined {
  if (disabled) return 'disabled';
  if (focused) return 'focused';
  if (selected) return 'selected';
  return undefined;
}

function tabSpan(
  widget: Widget,
  text: string,
  style: TerminalStyle | undefined,
  itemId: string,
  label: string,
  role: 'decoration' | 'separator' | 'text',
  partKind?: string,
  state?: string
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: widgetFrameSource(widget, {
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

function tabOverflowSpan(widget: Widget, text: string, part: 'overflow.leading' | 'overflow.trailing'): RenderSpan {
  const style = widgetStyle(widget, 'placeholder');
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: widgetFrameSource(widget, {
      family: 'layout',
      role: 'decoration',
      part,
      partKind: 'overflow',
      label: part
    })
  };
}
