import type { RenderNode } from '../render-node/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { ComponentActionTone } from '../components/contracts.ts';
import { renderNodeFrameSource } from './frame-source.ts';
import { clipRenderSpans, span } from './render-primitives.ts';
import type { RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import { mergeStyles, themeStyle, renderNodeStyle } from './render-node-style.ts';

export interface MenuVisualItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly description?: string;
  readonly shortcut?: string;
  readonly depth: number;
  readonly expanded?: boolean;
  readonly hasChildren: boolean;
  readonly tone?: ComponentActionTone;
}

export function menuTitleLine(widget: RenderNode, title: string, width: number): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(widget, title, renderNodeStyle(widget, 'title'), { label: 'title' })
    ], width)
  };
}

export function menuEmptyLine(widget: RenderNode, text: string, width: number): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(widget, text, renderNodeStyle(widget, 'placeholder'), { label: 'empty' })
    ], width)
  };
}

export function menuBarLine(
  widget: RenderNode,
  items: readonly MenuVisualItem[],
  selectedId: string | undefined,
  width: number,
  theme: TerminalTheme
): RenderLine {
  const spans: RenderSpan[] = [];
  items.forEach((item, index) => {
    if (index > 0) spans.push(menuSpan(widget, '  ', renderNodeStyle(widget, 'value', 'disabled'), { label: 'separator' }));
    spans.push(...menuBarItemSpans(widget, item, item.id === selectedId, theme));
  });
  return { spans: clipSpans(spans, width) };
}

export function dropdownControlLine(input: {
  readonly widget: RenderNode;
  readonly label: string;
  readonly value: string;
  readonly placeholder: boolean;
  readonly open: boolean;
  readonly width: number;
  readonly theme: TerminalTheme;
}): RenderLine {
  const stateStyle = input.placeholder
    ? renderNodeStyle(input.widget, 'placeholder')
    : renderNodeStyle(input.widget, 'value');
  const chromeStyle = renderNodeStyle(input.widget, 'border');
  const marker = input.open ? input.theme.tokens.symbols.treeExpanded : input.theme.tokens.symbols.treeCollapsed;
  const spans: RenderSpan[] = [
    ...(input.label.length === 0
      ? []
      : [
          menuSpan(input.widget, `${input.label}: `, renderNodeStyle(input.widget, 'label'), { label: 'label' })
        ]),
    menuSpan(input.widget, '[', chromeStyle, { label: 'dropdown-open' }),
    menuSpan(input.widget, input.value, stateStyle, { label: 'dropdown-value' }),
    menuSpan(input.widget, ` ${marker}`, chromeStyle, { label: 'dropdown-marker' }),
    menuSpan(input.widget, ']', chromeStyle, { label: 'dropdown-close' })
  ];
  return { spans: clipSpans(spans, input.width) };
}

export function menuItemLine(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  width: number,
  theme: TerminalTheme
): RenderLine {
  return {
    spans: clipSpans(menuItemSpans(widget, item, selected, theme), width)
  };
}

function menuBarItemSpans(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(widget, item, selected);
  const marker = item.disabled === true
    ? '-'
    : selected
      ? theme.tokens.symbols.pointer
      : item.tone === 'destructive'
        ? theme.tokens.symbols.statusError
        : '';
  return [
    ...(marker.length === 0 ? [] : [menuSpan(widget, `${marker} `, menuMarkerStyle(widget, item, selected), { itemId: item.id, label: 'marker' })]),
    menuSpan(widget, item.label, labelStyle, { itemId: item.id, label: 'label' })
  ];
}

function menuItemSpans(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(widget, item, selected);
  const marker = item.disabled === true
    ? '-'
    : selected
      ? theme.tokens.symbols.pointer
      : item.tone === 'destructive'
        ? theme.tokens.symbols.statusError
        : theme.tokens.symbols.unselected;
  const checked = item.checked === true ? theme.tokens.symbols.checkboxChecked : '   ';
  const branch = item.hasChildren ? item.expanded === true ? theme.tokens.symbols.treeExpanded : theme.tokens.symbols.treeCollapsed : theme.tokens.symbols.unselected;
  const indent = '  '.repeat(Math.max(0, item.depth));
  return [
    menuSpan(widget, `${marker} `, menuMarkerStyle(widget, item, selected), { itemId: item.id, label: 'marker' }),
    ...(indent.length === 0 ? [] : [menuSpan(widget, indent, menuMutedStyle(widget, selected), { itemId: item.id, label: 'indent' })]),
    menuSpan(widget, checked, item.checked === true ? menuCheckedStyle(widget, selected) : menuMutedStyle(widget, selected), { itemId: item.id, label: 'checked' }),
    menuSpan(widget, ' ', menuMutedStyle(widget, selected), { itemId: item.id, label: 'gap' }),
    menuSpan(widget, branch, item.hasChildren ? menuBranchStyle(widget, selected) : menuMutedStyle(widget, selected), { itemId: item.id, label: 'branch' }),
    menuSpan(widget, ' ', menuMutedStyle(widget, selected), { itemId: item.id, label: 'gap' }),
    menuSpan(widget, item.label, labelStyle, { itemId: item.id, label: 'label' }),
    ...descriptionSpans(widget, item, selected),
    ...shortcutSpans(widget, item, selected)
  ];
}

function descriptionSpans(widget: RenderNode, item: MenuVisualItem, selected: boolean): readonly RenderSpan[] {
  if (item.description === undefined || item.description.length === 0) return [];
  return [
    menuSpan(widget, '  ', menuMutedStyle(widget, selected), { itemId: item.id, label: 'description-gap' }),
    menuSpan(widget, item.description, menuMutedStyle(widget, selected), { itemId: item.id, label: 'description' })
  ];
}

function shortcutSpans(widget: RenderNode, item: MenuVisualItem, selected: boolean): readonly RenderSpan[] {
  if (item.shortcut === undefined || item.shortcut.length === 0) return [];
  return [
    menuSpan(widget, '  ', menuMutedStyle(widget, selected), { itemId: item.id, label: 'shortcut-gap' }),
    menuSpan(widget, item.shortcut, menuShortcutStyle(widget, selected), { itemId: item.id, label: 'shortcut' })
  ];
}

function menuLabelStyle(widget: RenderNode, item: MenuVisualItem, selected: boolean): TerminalStyle | undefined {
  if (item.disabled === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (item.tone === 'destructive') return mergeStyles(
    selected ? menuSelectedStyle(widget) : renderNodeStyle(widget, 'value'),
    renderNodeStyle(widget, 'error')
  );
  if (selected) return menuSelectedStyle(widget);
  return renderNodeStyle(widget, 'value');
}

function menuMarkerStyle(widget: RenderNode, item: MenuVisualItem, selected: boolean): TerminalStyle | undefined {
  if (item.disabled === true) return renderNodeStyle(widget, 'value', 'disabled');
  if (selected) return menuSelectedStyle(widget);
  return renderNodeStyle(widget, 'value');
}

function menuCheckedStyle(widget: RenderNode, selected: boolean): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'success'),
    selected ? menuSelectedStyle(widget) : undefined
  );
}

function menuBranchStyle(widget: RenderNode, selected: boolean): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'tree.branch' }
    },
    selected ? menuSelectedStyle(widget) : undefined
  );
}

function menuShortcutStyle(widget: RenderNode, selected: boolean): TerminalStyle | undefined {
  return selected ? menuSelectedStyle(widget) : renderNodeStyle(widget, 'label');
}

function menuMutedStyle(widget: RenderNode, selected: boolean): TerminalStyle | undefined {
  return selected ? menuSelectedStyle(widget) : renderNodeStyle(widget, 'placeholder');
}

function menuSelectedStyle(widget: RenderNode): TerminalStyle | undefined {
  return mergeStyles(renderNodeStyle(widget, 'value', 'selected'), themeStyle('menu.selected'), widget.styles?.selected);
}

function menuSpan(
  widget: RenderNode,
  text: string,
  style: TerminalStyle | undefined,
  source: { readonly itemId?: string; readonly label: string }
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, {
      family: 'menu',
      role: source.label === 'separator' ? 'separator' : 'text',
      part: source.label,
      ...(source.itemId === undefined ? {} : { itemId: source.itemId }),
      label: source.label
    })
  });
}

function clipSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  return clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…' });
}
