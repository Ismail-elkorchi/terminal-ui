import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import { stringify } from '../../widget-props.ts';
import { clampRect, emptyRect } from './common.ts';
import type { Rect } from '../../layout.ts';
import type { HitTarget } from '../../widget-renderer.ts';

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
  return tabs.map((tab, index) => `${index === selected ? '[' : ' '}${tab.label}${index === selected ? ']' : ' '}`).join(' ');
}

export function tabsAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  return tabs.map((tab, index) => ({
    id: `${widget.id ?? 'tabs'}:${tab.id}`,
    role: 'menuitem',
    label: tab.label,
    selected: index === selected,
    disabled: tab.disabled === true
  }));
}

export function tabsHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (bounds.height <= 0 || bounds.width <= 0) return [];
  const tabs = tabItems(widget);
  const targets: HitTarget<TMessage>[] = [];
  let column = bounds.column;
  for (const tab of tabs) {
    const width = tab.label.length + 2;
    if (tab.disabled !== true && tab.message !== undefined) {
      targets.push({
        id: `${widget.id ?? 'tabs'}:tab:${tab.id}`,
        bounds: {
          row: bounds.row,
          column,
          width: Math.min(width, Math.max(0, bounds.column + bounds.width - column)),
          height: 1
        },
        message: tab.message as TMessage,
        cursor: 'pointer'
      });
    }
    column += width + 1;
    if (column >= bounds.column + bounds.width) break;
  }
  return targets;
}

function tabItems(widget: Widget): readonly {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly message?: unknown;
}[] {
  if (!Array.isArray(widget.props['tabs'])) return [];
  return widget.props['tabs'].filter((tab): tab is {
    readonly id: string;
    readonly label: string;
    readonly disabled?: boolean;
    readonly message?: unknown;
  } =>
    typeof tab === 'object'
      && tab !== null
      && typeof (tab as { readonly id?: unknown }).id === 'string'
      && typeof (tab as { readonly label?: unknown }).label === 'string'
  );
}

function selectedTabIndex(widget: Widget, tabs: readonly { readonly id: string }[]): number {
  const selected = stringify(widget.props['selected']);
  const index = selected.length === 0 ? 0 : tabs.findIndex((tab) => tab.id === selected);
  return Math.max(0, index === -1 ? 0 : index);
}
