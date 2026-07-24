import type { RenderNode } from '../model/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { MenuActionTone } from '../../ui-model/menu.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { clipRenderSpans, span } from '../../visual/render.ts';
import type { RenderLine, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';
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
  readonly tone?: MenuActionTone;
}

export function menuTitleLine(renderNode: RenderNode, title: string, width: number, widthProfile: TextWidthProfile): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(renderNode, title, renderNodeStyle(renderNode, 'title'), { label: 'title' })
    ], width, widthProfile)
  };
}

export function menuEmptyLine(renderNode: RenderNode, text: string, width: number, widthProfile: TextWidthProfile): RenderLine {
  return {
    spans: clipSpans([
      menuSpan(renderNode, text, resolveRenderNodeStyle(renderNode, {
        part: 'empty',
        base: themeStyle('text.muted', { dim: true })
      }), { label: 'empty' })
    ], width, widthProfile)
  };
}

export function menuBarLine(
  renderNode: RenderNode,
  items: readonly MenuVisualItem[],
  selectedId: string | undefined,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderLine {
  const spans: RenderSpan[] = [];
  items.forEach((item, index) => {
    if (index > 0) spans.push(menuSpan(renderNode, '  ', renderNodeStyle(renderNode, 'separator'), { label: 'separator' }));
    const selected = item.id === selectedId;
    const state = interactionVisualState(renderNode, menuItemTargetId(renderNode, item.id), {
      disabled: item.disabled === true,
      selected,
      focused: focused && selected
    });
    spans.push(...menuBarItemSpans(renderNode, item, selected, state, theme));
  });
  return { spans: clipSpans(spans, width, widthProfile) };
}

export function dropdownMenuControlLine(input: {
  readonly renderNode: RenderNode;
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
    ? renderNodeStyle(input.renderNode, 'placeholder')
    : resolveRenderNodeStyle(input.renderNode, { part: 'label', base: themeStyle('text.default') });
  const chromeStyle = renderNodeStyle(input.renderNode, 'chrome');
  const marker = input.open ? input.theme.tokens.symbols.treeExpanded : input.theme.tokens.symbols.treeCollapsed;
  const state = interactionVisualState(input.renderNode, renderNodeTargetId(input.renderNode, 'control'), {
    selected: input.open,
    focused: input.focused === true
  });
  const controlStyle = state === undefined ? chromeStyle : resolveRenderNodeStyle(input.renderNode, { part: 'chrome', state });
  const spans: RenderSpan[] = [
    ...(input.label.length === 0
      ? []
      : [
          menuSpan(input.renderNode, `${input.label}: `, renderNodeStyle(input.renderNode, 'label'), { label: 'label' })
        ]),
    menuSpan(input.renderNode, '[', controlStyle, { label: 'dropdownMenu-open', state }),
    menuSpan(input.renderNode, input.value, mergeStyles(stateStyle, controlStyle), { label: 'dropdownMenu-value', state }),
    menuSpan(input.renderNode, ` ${marker}`, controlStyle, { label: 'dropdownMenu-marker', state }),
    menuSpan(input.renderNode, ']', controlStyle, { label: 'dropdownMenu-close', state })
  ];
  return { spans: clipSpans(spans, input.width, input.widthProfile) };
}

export function menuItemLine(
  renderNode: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderLine {
  const state = interactionVisualState(renderNode, menuItemTargetId(renderNode, item.id), {
    disabled: item.disabled === true,
    selected,
    focused: focused && selected
  });
  return {
    spans: clipSpans(menuItemSpans(renderNode, item, selected, state, theme), width, widthProfile)
  };
}

function menuBarItemSpans(
  renderNode: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(renderNode, item, state);
  const marker = item.disabled === true
    ? '-'
    : selected
      ? theme.tokens.symbols.pointer
      : item.tone === 'destructive'
        ? theme.tokens.symbols.statusError
        : '';
  return [
    ...(marker.length === 0 ? [] : [menuSpan(renderNode, `${marker} `, menuMarkerStyle(renderNode, item, state), { itemId: item.id, label: 'marker', state })]),
    ...menuInlineSpans(renderNode, item.leading, 'leading', item, state, theme),
    ...(item.leading === undefined ? [] : [menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'leading-gap', state })]),
    menuSpan(renderNode, item.label, labelStyle, { itemId: item.id, label: 'label', state }),
    ...(item.trailing === undefined ? [] : [menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'trailing-gap', state })]),
    ...menuInlineSpans(renderNode, item.trailing, 'trailing', item, state, theme)
  ];
}

function menuItemSpans(
  renderNode: RenderNode,
  item: MenuVisualItem,
  selected: boolean,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const labelStyle = menuLabelStyle(renderNode, item, state);
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
    menuSpan(renderNode, `${marker} `, menuMarkerStyle(renderNode, item, state), { itemId: item.id, label: 'marker', state }),
    ...(indent.length === 0 ? [] : [menuSpan(renderNode, indent, menuMutedStyle(renderNode, state), { itemId: item.id, label: 'indent', state })]),
    menuSpan(renderNode, checked, item.checked === true ? menuCheckedStyle(renderNode, state) : menuMutedStyle(renderNode, state), { itemId: item.id, label: 'checked', state }),
    menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'gap', state }),
    menuSpan(renderNode, branch, item.hasChildren ? menuBranchStyle(renderNode, state) : menuMutedStyle(renderNode, state), { itemId: item.id, label: 'branch', state }),
    menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'gap', state }),
    ...menuInlineSpans(renderNode, item.leading, 'leading', item, state, theme),
    ...(item.leading === undefined ? [] : [menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'leading-gap', state })]),
    menuSpan(renderNode, item.label, labelStyle, { itemId: item.id, label: 'label', state }),
    ...descriptionSpans(renderNode, item, state),
    ...shortcutSpans(renderNode, item, state),
    ...(item.trailing === undefined ? [] : [menuSpan(renderNode, ' ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'trailing-gap', state })]),
    ...menuInlineSpans(renderNode, item.trailing, 'trailing', item, state, theme)
  ];
}

function menuInlineSpans(
  renderNode: RenderNode,
  content: InlineContent | undefined,
  part: 'leading' | 'trailing',
  item: MenuVisualItem,
  state: ElementVisualState | undefined,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (content === undefined) return [];
  const style = mergeStyles(
    menuLabelStyle(renderNode, item, state),
    renderNode.styles?.parts?.[part]
  );
  return renderInlineContent(content, {
    theme,
    ...(style === undefined ? {} : { baseStyle: style }),
    source: (_segment: InlineContentSegment, index) => renderNodeFrameSource(renderNode, {
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

function descriptionSpans(renderNode: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): readonly RenderSpan[] {
  if (item.description === undefined || item.description.length === 0) return [];
  return [
    menuSpan(renderNode, '  ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'description-gap', state }),
    menuSpan(renderNode, item.description, menuMutedStyle(renderNode, state), { itemId: item.id, label: 'description', state })
  ];
}

function shortcutSpans(renderNode: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): readonly RenderSpan[] {
  if (item.shortcut === undefined || item.shortcut.length === 0) return [];
  return [
    menuSpan(renderNode, '  ', menuMutedStyle(renderNode, state), { itemId: item.id, label: 'shortcut-gap', state }),
    menuSpan(renderNode, item.shortcut, menuShortcutStyle(renderNode, state), { itemId: item.id, label: 'shortcut', state })
  ];
}

function menuLabelStyle(renderNode: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): TerminalStyle | undefined {
  const stateStyle = resolveRenderNodeStyle(renderNode, {
    part: 'label',
    base: state === 'selected' ? themeStyle('menu.selected') : themeStyle('text.default'),
    ...(state === undefined ? {} : { state })
  });
  if (item.tone === 'destructive') return mergeStyles(
    stateStyle,
    renderNodeStyle(renderNode, 'label', 'error')
  );
  return stateStyle;
}

function menuMarkerStyle(renderNode: RenderNode, item: MenuVisualItem, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    menuStateStyle(renderNode, 'marker', state),
    item.tone === 'destructive' ? renderNodeStyle(renderNode, 'marker', 'error') : undefined
  );
}

function menuCheckedStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    renderNodeStyle(renderNode, 'marker', 'success'),
    menuStateStyle(renderNode, 'marker', state)
  );
}

function menuBranchStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return mergeStyles(
    {
      fg: { kind: 'theme', token: 'tree.branch' }
    },
    menuStateStyle(renderNode, 'marker', state)
  );
}

function menuShortcutStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return menuStateStyle(renderNode, 'shortcut', state);
}

function menuMutedStyle(renderNode: RenderNode, state: ElementVisualState | undefined): TerminalStyle | undefined {
  return menuStateStyle(renderNode, 'description', state);
}

function menuStateStyle(
  renderNode: RenderNode,
  part: 'description' | 'label' | 'marker' | 'shortcut',
  state: ElementVisualState | undefined
): TerminalStyle | undefined {
  return resolveRenderNodeStyle(renderNode, {
    part,
    ...(state === 'selected' ? { base: themeStyle('menu.selected') } : {}),
    ...(state === undefined ? {} : { state })
  });
}

function menuSpan(
  renderNode: RenderNode,
  text: string,
  style: TerminalStyle | undefined,
  source: { readonly itemId?: string; readonly label: string; readonly state?: ElementVisualState | undefined }
): RenderSpan {
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: renderNodeFrameSource(renderNode, {
      family: 'menu',
      role: source.label === 'separator' ? 'separator' : 'text',
      part: source.label,
      ...(source.itemId === undefined ? {} : { itemId: source.itemId }),
      ...(isFrameCellInteractionState(source.state) ? { state: source.state } : {}),
      label: source.label
    })
  });
}

function menuItemTargetId(renderNode: RenderNode, itemId: string): string {
  return renderNodeTargetId(renderNode, itemId);
}

function clipSpans(
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  return clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…', widthProfile });
}
