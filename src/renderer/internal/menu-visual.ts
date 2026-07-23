import type { RenderNode } from '../model/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { ComponentActionTone } from '../../ui-model/contracts.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { clipRenderSpans, span } from '../../visual/render.ts';
import type { RenderLine, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-presentation.ts';
import { renderInlineContent } from './inline-content.ts';
import type { InlineContent, InlineContentSegment } from '../../visual/inline-content.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface MenuVisualItem {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly description?: string;
  readonly shortcut?: string;
  readonly depth: number;
  readonly expanded?: boolean;
  readonly hasChildren: boolean;
  readonly tone?: ComponentActionTone;
}

export function menuTitleLine(widget: RenderNode, title: string, width: number, widthProfile: TextWidthProfile): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(widget, title, renderNodeStyle(widget, 'title'), { label: 'title' })
    ], width, widthProfile)
  };
}

export function menuEmptyLine(widget: RenderNode, text: string, width: number, widthProfile: TextWidthProfile): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(widget, text, resolveRenderNodeStyle(widget, {
        part: 'empty',
        base: themeStyle('text.muted', { dim: true })
      }), { label: 'empty' })
    ], width, widthProfile)
  };
}

export function menuBarLine(
  widget: RenderNode,
  items: readonly MenuVisualItem[],
  selectedId: string | undefined,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderLine {
  const spans: RenderSpan[] = [];
  items.forEach((item, index) => {
    if (index > 0) spans.push(menuSpan(widget, '  ', renderNodeStyle(widget, 'separator'), { label: 'separator' }));
    const selected = item.id === selectedId;
    const state = interactionVisualState(widget, menuItemTargetId(widget, item.id), {
      disabled: item.disabled === true,
      selected,
      focused: focused && selected
    });
    spans.push(...menuBarItemSpans(widget, item, selected, state, theme));
  });
  return { spans: clipSpans(spans, width, widthProfile) };
}

export function dropdownMenuControlLine(input: {
  readonly widget: RenderNode;
  readonly label: string;
  readonly value: string;
  readonly placeholder: boolean;
  readonly open: boolean;
  readonly focused?: boolean;
  readonly width: number;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}): RenderLine {
  const stateStyle = input.placeholder
    ? renderNodeStyle(input.widget, 'placeholder')
    : resolveRenderNodeStyle(input.widget, { part: 'label', base: themeStyle('text.default') });
  const chromeStyle = renderNodeStyle(input.widget, 'chrome');
  const marker = input.open ? input.theme.tokens.symbols.treeExpanded : input.theme.tokens.symbols.treeCollapsed;
  const state = interactionVisualState(input.widget, renderNodeTargetId(input.widget, 'control'), {
    selected: input.open,
    focused: input.focused === true
  });
  const controlStyle = state === undefined ? chromeStyle : resolveRenderNodeStyle(input.widget, { part: 'chrome', state });
  const spans: RenderSpan[] = [
    ...(input.label.length === 0
      ? []
      : [
          menuSpan(input.widget, `${input.label}: `, renderNodeStyle(input.widget, 'label'), { label: 'label' })
        ]),
    menuSpan(input.widget, '[', controlStyle, { label: 'dropdownMenu-open', state }),
    menuSpan(input.widget, input.value, mergeStyles(stateStyle, controlStyle), { label: 'dropdownMenu-value', state }),
    menuSpan(input.widget, ` ${marker}`, controlStyle, { label: 'dropdownMenu-marker', state }),
    menuSpan(input.widget, ']', controlStyle, { label: 'dropdownMenu-close', state })
  ];
  return { spans: clipSpans(spans, input.width, input.widthProfile) };
}

export function menuItemLine(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderLine {
  const state = interactionVisualState(widget, menuItemTargetId(widget, item.id), {
    disabled: item.disabled === true,
    selected,
    focused: focused && selected
  });
  return {
    spans: clipSpans(menuItemSpans(widget, item, selected, state, theme), width, widthProfile)
  };
}

function menuBarItemSpans(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(widget, item, state);
  const marker = item.disabled === true
    ? '-'
    : selected
      ? theme.tokens.symbols.pointer
      : item.tone === 'destructive'
        ? theme.tokens.symbols.statusError
        : '';
  return [
    ...(marker.length === 0 ? [] : [menuSpan(widget, `${marker} `, menuMarkerStyle(widget, item, state), { itemId: item.id, label: 'marker', state })]),
    ...menuInlineSpans(widget, item.leading, 'leading', item, state, theme),
    ...(item.leading === undefined ? [] : [menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'leading-gap', state })]),
    menuSpan(widget, item.label, labelStyle, { itemId: item.id, label: 'label', state }),
    ...(item.trailing === undefined ? [] : [menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'trailing-gap', state })]),
    ...menuInlineSpans(widget, item.trailing, 'trailing', item, state, theme)
  ];
}

function menuItemSpans(
  widget: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(widget, item, state);
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
    menuSpan(widget, `${marker} `, menuMarkerStyle(widget, item, state), { itemId: item.id, label: 'marker', state }),
    ...(indent.length === 0 ? [] : [menuSpan(widget, indent, menuMutedStyle(widget, state), { itemId: item.id, label: 'indent', state })]),
    menuSpan(widget, checked, item.checked === true ? menuCheckedStyle(widget, state) : menuMutedStyle(widget, state), { itemId: item.id, label: 'checked', state }),
    menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'gap', state }),
    menuSpan(widget, branch, item.hasChildren ? menuBranchStyle(widget, state) : menuMutedStyle(widget, state), { itemId: item.id, label: 'branch', state }),
    menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'gap', state }),
    ...menuInlineSpans(widget, item.leading, 'leading', item, state, theme),
    ...(item.leading === undefined ? [] : [menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'leading-gap', state })]),
    menuSpan(widget, item.label, labelStyle, { itemId: item.id, label: 'label', state }),
    ...descriptionSpans(widget, item, state),
    ...shortcutSpans(widget, item, state),
    ...(item.trailing === undefined ? [] : [menuSpan(widget, ' ', menuMutedStyle(widget, state), { itemId: item.id, label: 'trailing-gap', state })]),
    ...menuInlineSpans(widget, item.trailing, 'trailing', item, state, theme)
  ];
}

function menuInlineSpans(
  widget: RenderNode,
  content: InlineContent | undefined,
  part: 'leading' | 'trailing',
  item: MenuVisualItem,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (content === undefined) return [];
  const style = mergeStyles(
    menuLabelStyle(widget, item, state),
    widget.styles?.parts?.[part]
  );
  return renderInlineContent(content, {
    theme,
    ...(style === undefined ? {} : { baseStyle: style }),
    source: (_segment: InlineContentSegment, index) => renderNodeFrameSource(widget, {
      family: 'menu',
      role: 'text',
      part: `${part}.${String(index)}`,
      partKind: part,
      itemId: item.id,
      ...(isFrameCellInteractionState(state) ? { state } : {}),
      label: `${part}.${String(index)}`
    })
  });
}

function descriptionSpans(widget: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): readonly RenderSpan[] {
  if (item.description === undefined || item.description.length === 0) return [];
  return [
    menuSpan(widget, '  ', menuMutedStyle(widget, state), { itemId: item.id, label: 'description-gap', state }),
    menuSpan(widget, item.description, menuMutedStyle(widget, state), { itemId: item.id, label: 'description', state })
  ];
}

function shortcutSpans(widget: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): readonly RenderSpan[] {
  if (item.shortcut === undefined || item.shortcut.length === 0) return [];
  return [
    menuSpan(widget, '  ', menuMutedStyle(widget, state), { itemId: item.id, label: 'shortcut-gap', state }),
    menuSpan(widget, item.shortcut, menuShortcutStyle(widget, state), { itemId: item.id, label: 'shortcut', state })
  ];
}

function menuLabelStyle(widget: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): TerminalStyle | undefined {
  const stateStyle = resolveRenderNodeStyle(widget, {
    part: 'label',
    base: state === 'selected' ? themeStyle('menu.selected') : themeStyle('text.default'),
    ...(state === undefined ? {} : { state })
  });
  if (item.tone === 'destructive') return mergeStyles(
    stateStyle,
    renderNodeStyle(widget, 'label', 'error')
  );
  return stateStyle;
}

function menuMarkerStyle(widget: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    menuStateStyle(widget, 'marker', state),
    item.tone === 'destructive' ? renderNodeStyle(widget, 'marker', 'error') : undefined
  );
}

function menuCheckedStyle(widget: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(widget, 'marker', 'success'),
    menuStateStyle(widget, 'marker', state)
  );
}

function menuBranchStyle(widget: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'tree.branch' }
    },
    menuStateStyle(widget, 'marker', state)
  );
}

function menuShortcutStyle(widget: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return menuStateStyle(widget, 'shortcut', state);
}

function menuMutedStyle(widget: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return menuStateStyle(widget, 'description', state);
}

function menuStateStyle(
  widget: RenderNode,
  part: 'description' | 'label' | 'marker' | 'shortcut',
  state: ElementVisualState | undefined
): TerminalStyle | undefined {
  return resolveRenderNodeStyle(widget, {
    part,
    ...(state === 'selected' ? { base: themeStyle('menu.selected') } : {}),
    ...(state === undefined ? {} : { state })
  });
}

function menuSpan(
  widget: RenderNode,
  text: string,
  style: TerminalStyle | undefined,
  source: { readonly itemId?: string; readonly label: string; readonly state?: ElementVisualState | undefined }
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(widget, {
      family: 'menu',
      role: source.label === 'separator' ? 'separator' : 'text',
      part: source.label,
      ...(source.itemId === undefined ? {} : { itemId: source.itemId }),
      ...(isFrameCellInteractionState(source.state) ? { state: source.state } : {}),
      label: source.label
    })
  });
}

function menuItemTargetId(widget: RenderNode, itemId: string): string {
  return renderNodeTargetId(widget, itemId);
}

function clipSpans(
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  return clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…', widthProfile });
}
