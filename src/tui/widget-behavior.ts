import { clipTextCells, measureTextCells } from '../text/index.ts';
import {
  commandBarAccessibleChildren,
  commandBarBlock,
  commandBarCursor
} from './command-bar.ts';
import { drawBorder } from './border.ts';
import { createFrameBuffer } from './frame.ts';
import {
  barChartAccessibleBase,
  barChartAccessibleChildren,
  barChartText,
  chartAccessibleBase,
  chartText,
  sparklineAccessibleBase,
  sparklineText
} from './chart-widgets.ts';
import {
  paginatorAccessibleBase,
  paginatorText
} from './data-widgets.ts';
import { gridCellRects, layoutContentBounds, splitTracks } from './regions.ts';
import { normalizeScrollState, visibleWindowFromScroll } from './scroll.ts';
import { paletteAccessibleChildren, paletteBlock } from './palette.ts';
import { visibleWindow, windowDescription } from './visible-window.ts';
import {
  scrollbackAccessibleBase,
  scrollbackAccessibleChildren,
  scrollbackBlock
} from './scrollback.ts';
import {
  activityFeedAccessibleBase,
  activityFeedAccessibleChildren,
  activityFeedBlock,
  structuredBlockAccessibleBase,
  structuredBlockBlock
} from './structured-block.ts';
import {
  activityIndicatorAccessibleBase,
  activityIndicatorText,
  helpBarAccessibleBase,
  helpBarText,
  richTextAccessibleBase,
  richTextBlock,
  textAreaAccessibleBase,
  textAreaCursor,
  textAreaText
} from './text-widgets.ts';
import {
  buttonAccessibleBase,
  buttonBlock,
  checkboxAccessibleBase,
  checkboxBlock,
  controlHitTargets,
  fieldAccessibleBase,
  fieldBlock,
  fieldContentBounds,
  formAccessibleBase,
  formBlock,
  formContentBounds,
  labelAccessibleBase,
  labelBlock,
  numberInputAccessibleBase,
  numberInputBlock,
  numberInputCursor,
  optionHitTargets,
  radioGroupAccessibleBase,
  radioGroupAccessibleChildren,
  radioGroupBlock,
  selectBoxAccessibleBase,
  selectBoxAccessibleChildren,
  selectBoxBlock,
  textInputAccessibleBase,
  textInputBlock,
  textInputCursor
} from './form-widgets.ts';
import {
  absoluteAccessibleBase,
  absoluteChildBounds,
  canvasAccessibleBase,
  overlayAccessibleBase,
  overlayChildBounds,
  renderCanvas,
  surfaceAccessibleBase,
  surfaceChildBounds
} from './drawing-widgets.ts';
import {
  contextMenuBlock,
  contextMenuHitTargets,
  dropdownAccessibleBase,
  dropdownAccessibleChildren,
  dropdownBlock,
  dropdownHitTargets,
  menuAccessibleBase,
  menuAccessibleChildren,
  menuBarBlock,
  menuBarHitTargets,
  menuBlock,
  menuCursor,
  menuHitTargets
} from './menu-widgets.ts';
import { tableAccessibleBase, tableAccessibleChildren, tableBlock } from './table.ts';
import { treeAccessibleBase, treeAccessibleChildren, treeBlock, treeHitTargets } from './tree.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget, WidgetFocusScope, WidgetKind } from '../widgets/index.ts';
import type { BorderStyle } from './border.ts';
import type { WidgetLayoutTarget } from './focus.ts';
import type { FrameBuffer, FrameCell, RenderBlock, RenderLine, RenderSpan, TerminalColor, TerminalStyle } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type {
  GridLayoutOptions,
  LayoutAlignment,
  LayoutFlowOptions,
  LayoutInsetInput,
  LayoutJustification,
  LayoutOverflow,
  LayoutSize
} from './regions.ts';
import type { FocusTarget, HitTarget, WidgetRenderer, WidgetRenderInput } from './widget-renderer.ts';

type BuiltinWidgetKind = Exclude<WidgetKind, 'custom'>;

const widgetRenderers = {
  text: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, stringify(widget.props['content']));
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'text',
      label: id,
      value: stringify(widget.props['content'])
    })
  },
  richText: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, richTextBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id }) => richTextAccessibleBase(widget, id)
  },
  statusBar: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, stringify(widget.props['text']));
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['text'])
    })
  },
  inputField: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, stringify(widget.props['value']));
    },
    accessibility: ({ widget, id, focused }) => ({
      id,
      role: 'textbox',
      label: id,
      value: stringify(widget.props['value']),
      ...(focused ? { focused } : {})
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)]
  },
  textArea: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, textAreaText(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => textAreaAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, textAreaCursor(widget, bounds))]
  },
  form: {
    layout: ({ widget, bounds }) => splitTracks(
      formContentBounds(widget, bounds),
      'vertical',
      fillLayoutSizes(widget.children?.length ?? 0),
      layoutFlowOptions(widget)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.node.bounds, formBlock(input.widget, input.node.bounds));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => formAccessibleBase(widget, id, focused)
  },
  field: {
    layout: ({ widget, bounds }) => splitTracks(
      fieldContentBounds(widget, bounds),
      'vertical',
      fillLayoutSizes(widget.children?.length ?? 0),
      layoutFlowOptions(widget)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.node.bounds, fieldBlock(input.widget, input.node.bounds));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => fieldAccessibleBase(widget, id, focused)
  },
  label: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, labelBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id }) => labelAccessibleBase(widget, id)
  },
  button: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, buttonBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => buttonAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => controlHitTargets(widget, bounds)
  },
  checkbox: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, checkboxBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => checkboxAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => controlHitTargets(widget, bounds)
  },
  radioGroup: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, radioGroupBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...radioGroupAccessibleBase(widget, id, focused),
      children: radioGroupAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => optionHitTargets(widget, bounds)
  },
  selectBox: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, selectBoxBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...selectBoxAccessibleBase(widget, id, focused),
      children: selectBoxAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => optionHitTargets(widget, bounds)
  },
  textInput: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, textInputBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => textInputAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds, textInputCursor(widget, bounds))]
  },
  numberInput: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, numberInputBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => numberInputAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds, numberInputCursor(widget, bounds))]
  },
  menu: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, menuBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => menuHitTargets(widget, bounds)
  },
  menuBar: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, menuBarBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => menuBarHitTargets(widget, bounds)
  },
  contextMenu: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, contextMenuBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...menuAccessibleBase(widget, id, focused),
      children: menuAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, menuCursor(widget, bounds, widget.props['title'] === undefined ? 0 : 1))],
    hitTargets: ({ widget, bounds }) => contextMenuHitTargets(widget, bounds)
  },
  dropdown: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, dropdownBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => {
      const children = dropdownAccessibleChildren(widget);
      return {
        ...dropdownAccessibleBase(widget, id, focused),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, menuCursor(widget, bounds, widget.props['open'] === true ? 1 : 0))],
    hitTargets: ({ widget, bounds }) => dropdownHitTargets(widget, bounds)
  },
  canvas: {
    render: (input) => {
      renderCanvas(input);
    },
    accessibility: ({ widget, id, focused }) => canvasAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  surface: {
    layout: ({ widget, bounds }) => surfaceChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => surfaceAccessibleBase(widget, id, focused)
  },
  absolute: {
    layout: ({ widget, bounds }) => absoluteChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  overlay: {
    layout: ({ widget, bounds }) => overlayChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  },
  helpBar: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, helpBarText(widget));
    },
    accessibility: ({ widget, id }) => helpBarAccessibleBase(widget, id)
  },
  activityIndicator: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, activityIndicatorText(widget, theme));
    },
    accessibility: ({ widget, id }) => activityIndicatorAccessibleBase(widget, id)
  },
  spinner: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, `${stringify(widget.props['label']) || 'Loading'} ...`);
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['label']) || 'Loading'
    })
  },
  progressBar: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, progressText(widget, theme));
    },
    accessibility: ({ widget, id }) => accessibleProgressNode(widget, id)
  },
  sparkline: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, sparklineText(widget));
    },
    accessibility: ({ widget, id }) => sparklineAccessibleBase(widget, id)
  },
  barChart: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, barChartText(widget, node, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...barChartAccessibleBase(widget, node, id, focused),
      children: barChartAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  chart: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, chartText(widget, node));
    },
    accessibility: ({ widget, id }) => chartAccessibleBase(widget, id)
  },
  list: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, listText(widget, node.bounds.height, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...listAccessibleNode(widget, node, id, focused),
      children: listAccessibleChildren(widget, node)
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, listCursor(widget, bounds))]
  },
  table: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, tableBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...tableAccessibleBase(widget, node.bounds, id, focused),
      children: tableAccessibleChildren(widget, node.bounds)
    })
  },
  tree: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, treeBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...treeAccessibleBase(widget, node.bounds, id, focused),
      children: treeAccessibleChildren(widget, node.bounds)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => treeHitTargets(widget, bounds)
  },
  paginator: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, paginatorText(widget));
    },
    accessibility: ({ widget, id }) => paginatorAccessibleBase(widget, id)
  },
  box: {
    layout: ({ widget, bounds }) => (widget.children ?? [])
      .map(() => layoutContentBounds(borderContentBounds(bounds, borderForWidget(widget)), layoutFlowOptions(widget))),
    render: (input) => {
      drawBorder(input.buffer, input.node.bounds, borderForWidget(input.widget), input.theme);
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  row: {
    layout: ({ widget, bounds }) => splitTracks(bounds, 'horizontal', fillLayoutSizes(widget.children?.length ?? 0), layoutFlowOptions(widget)),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  stack: {
    layout: ({ widget, bounds }) => splitTracks(bounds, 'vertical', fillLayoutSizes(widget.children?.length ?? 0), layoutFlowOptions(widget)),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  viewport: {
    layout: ({ widget, bounds }) => [viewportChildBounds(widget, bounds)],
    render: (input) => {
      const viewportBuffer = createFrameBuffer(input.buffer.width, input.buffer.height);
      input.renderChildren(viewportBuffer);
      for (const cell of viewportBuffer.snapshot().cells) {
        if (cellInside(cell, input.node.bounds)) input.buffer.writeCell(cell);
      }
    },
    accessibility: ({ widget, node, id }) => ({
      id,
      role: 'text',
      label: id,
      description: viewportAccessibleDescription(widget, node)
    })
  },
  scrollback: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, scrollbackBlock(widget, node));
    },
    accessibility: ({ widget, node, id }) => ({
      ...scrollbackAccessibleBase(widget, node, id),
      children: scrollbackAccessibleChildren(widget, node)
    })
  },
  structuredBlock: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, structuredBlockBlock(widget, node, theme));
    },
    accessibility: ({ widget, id }) => structuredBlockAccessibleBase(widget, id)
  },
  activityFeed: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, activityFeedBlock(widget, node, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      ...activityFeedAccessibleBase(widget, node, id, focused),
      children: activityFeedAccessibleChildren(widget, node)
    })
  },
  commandBar: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, commandBarBlock(widget, node.bounds.height, theme));
    },
    accessibility: ({ widget, id, focused }) => {
      const children = commandBarAccessibleChildren(widget);
      return {
        id,
        role: 'textbox',
        label: stringify(widget.props['prompt']) || id,
        value: stringify(widget.props['value']),
        ...(focused ? { focused } : {}),
        ...(children === undefined ? {} : { children })
      };
    },
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, commandBarCursor(widget, bounds))]
  },
  palette: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, paletteBlock(widget, node.bounds.height, theme));
    },
    accessibility: ({ widget, node, id, focused }) => ({
      id,
      role: 'menu',
      label: stringify(widget.props['title']) || id,
      value: stringify(widget.props['query']),
      ...(focused ? { focused } : {}),
      children: paletteAccessibleChildren(widget, node.bounds.height)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)]
  },
  grid: {
    layout: ({ widget, bounds }) => gridChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  splitPane: {
    layout: ({ widget, bounds }) => splitPaneChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => groupAccessibleNode(id, focused)
  },
  tabs: {
    layout: ({ widget, bounds }) => tabsChildBounds(widget, bounds),
    render: (input) => {
      writeBlock(input.buffer, { ...input.node.bounds, height: Math.min(1, input.node.bounds.height) }, tabsHeaderText(input.widget));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => ({
      id,
      role: 'menu',
      label: id,
      ...(focused ? { focused } : {}),
      children: tabsAccessibleChildren(widget)
    })
  },
  modal: {
    layout: ({ widget, bounds }) => [borderContentBounds(modalChildBounds(widget, bounds), borderForModal(widget))],
    render: (input) => {
      const childBounds = modalChildBounds(input.widget, input.node.bounds);
      drawBorder(input.buffer, childBounds, borderForModal(input.widget), input.theme);
      input.renderChildren();
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'dialog',
      label: modalLabel(widget) || id
    })
  }
} satisfies Record<BuiltinWidgetKind, WidgetRenderer>;

export function widgetRenderer<TMessage>(widget: Widget<TMessage>): WidgetRenderer<TMessage> {
  if (widget.kind === 'custom') return customRenderer(widget);
  return widgetRenderers[widget.kind] as WidgetRenderer<TMessage>;
}

export function layoutChildBounds(widget: Widget, bounds: Rect, theme: TerminalTheme): readonly Rect[] {
  const children = widget.children ?? [];
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));
  const renderer = widgetRenderer(widget);
  if (renderer.layout === undefined) {
    throw new Error(`Widget "${widget.kind}" has children but does not define layout.`);
  }
  return renderer.layout({ widget, bounds, theme });
}

function hasKeyboardOrInputMap(widget: Widget): boolean {
  return (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0)
    || widget.inputMap?.text !== undefined
    || widget.inputMap?.paste !== undefined;
}

export function renderWidgetRenderer(
  widget: Widget,
  input: Omit<WidgetRenderInput, 'widget'>
): void {
  widgetRenderer(widget).render({ ...input, widget });
}

export function widgetAccessibleNode(
  widget: Widget,
  node: LayoutNode,
  id: string,
  focused: boolean,
  theme: TerminalTheme
): AccessibleNode {
  const renderer = widgetRenderer(widget);
  if (renderer.accessibility === undefined) {
    throw new Error(`Widget "${id}" must provide accessibility or be marked decorative.`);
  }
  return renderer.accessibility({ widget, node, id, focused, theme });
}

export function widgetFocusTargets(widget: Widget, bounds: Rect, theme: TerminalTheme): readonly FocusTarget[] {
  const explicit = widgetRenderer(widget).focusTargets?.({ widget, bounds, theme }) ?? [];
  const targets = explicit.length > 0 || !hasKeyboardOrInputMap(widget)
    ? explicit
    : [{ bounds }];
  return targets.map((target): FocusTarget => {
    const order = target.order ?? widget.focus?.order;
    return {
      ...(target.id === undefined ? {} : { id: target.id }),
      bounds: target.bounds,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      disabled: target.disabled === true || widget.focus?.disabled === true,
      ...(order === undefined ? {} : { order })
    };
  });
}

export function widgetFocusScope(widget: Widget): WidgetFocusScope | undefined {
  const scope = widget.focus?.scope ?? (widget.kind === 'modal' ? 'contain' : undefined);
  return scope === 'none' ? undefined : scope;
}

export function widgetCursor(
  widget: Widget,
  target: WidgetLayoutTarget<unknown>,
  theme: TerminalTheme
): { readonly row: number; readonly column: number } | undefined {
  return target.cursor
    ?? widgetFocusTargets(widget, target.bounds, theme).find((item) => sameRect(item.bounds, target.bounds))?.cursor;
}

export function widgetHitTargets<TMessage>(
  widget: Widget<TMessage>,
  target: WidgetLayoutTarget<TMessage>,
  theme: TerminalTheme
): readonly HitTarget<TMessage>[] {
  return [
    ...(widgetRenderer(widget).hitTargets?.({ widget, bounds: target.bounds, theme }) ?? []),
    ...mouseMapHitTargets(widget, target.bounds, target.layer.zIndex)
  ];
}

function mouseMapHitTargets<TMessage>(
  widget: Widget<TMessage>,
  bounds: Rect,
  zIndex: number
): readonly HitTarget<TMessage>[] {
  if (widget.mouseMap === undefined) return [];
  return Object.entries(widget.mouseMap).map(([action, message]) => ({
    id: `${widget.id ?? widget.kind}:mouse:${action}`,
    bounds,
    message,
    cursor: 'pointer' as const,
    zIndex
  }));
}

function customRenderer<TMessage>(widget: Widget<TMessage>): WidgetRenderer<TMessage> {
  const renderer = widget.custom?.renderer;
  if (renderer === undefined) {
    throw new Error('Custom widgets must provide a renderer.');
  }
  return renderer;
}

function borderForWidget(widget: Widget): BorderStyle {
  return borderFromValue(widget.props['border']) ?? { kind: 'single' };
}

function borderForModal(widget: Widget): BorderStyle {
  const border = borderFromValue(widget.props['border']) ?? { kind: 'single' };
  if (border.title !== undefined || border.kind === 'none') return border;
  const title = modalLabel(widget);
  return title.length === 0 ? border : { ...border, title };
}

function modalLabel(widget: Widget): string {
  const title = stringify(widget.props['title']);
  if (title.length > 0) return title;
  return borderFromValue(widget.props['border'])?.title ?? '';
}

function borderContentBounds(bounds: Rect, border: BorderStyle): Rect {
  return border.kind === 'none' ? bounds : inset(bounds, 1);
}

function borderFromValue(value: unknown): BorderStyle | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (!isBorderKind(kind)) return undefined;
  const title = value['title'];
  const style = terminalStyleFromValue(value['style']);
  return {
    kind,
    ...(typeof title === 'string' ? { title } : {}),
    ...(style === undefined ? {} : { style })
  };
}

function isBorderKind(value: unknown): value is BorderStyle['kind'] {
  return value === 'none'
    || value === 'single'
    || value === 'double'
    || value === 'rounded'
    || value === 'heavy'
    || value === 'ascii';
}

function terminalStyleFromValue(value: unknown): TerminalStyle | undefined {
  if (!isRecord(value)) return undefined;
  const fg = terminalColorFromValue(value['fg']);
  const bg = terminalColorFromValue(value['bg']);
  return {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(typeof value['bold'] === 'boolean' ? { bold: value['bold'] } : {}),
    ...(typeof value['dim'] === 'boolean' ? { dim: value['dim'] } : {}),
    ...(typeof value['italic'] === 'boolean' ? { italic: value['italic'] } : {}),
    ...(typeof value['underline'] === 'boolean' ? { underline: value['underline'] } : {}),
    ...(typeof value['strikethrough'] === 'boolean' ? { strikethrough: value['strikethrough'] } : {}),
    ...(typeof value['inverse'] === 'boolean' ? { inverse: value['inverse'] } : {}),
    ...(typeof value['hidden'] === 'boolean' ? { hidden: value['hidden'] } : {})
  };
}

function terminalColorFromValue(value: unknown): TerminalColor | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind === 'ansi') {
    const color = value['value'];
    return typeof color === 'number' && Number.isFinite(color) ? { kind, value: color } : undefined;
  }
  if (kind === 'rgb') {
    const r = value['r'];
    const g = value['g'];
    const b = value['b'];
    return typeof r === 'number' && Number.isFinite(r)
      && typeof g === 'number' && Number.isFinite(g)
      && typeof b === 'number' && Number.isFinite(b)
      ? { kind, r, g, b }
      : undefined;
  }
  if (kind === 'theme') {
    const token = value['token'];
    return typeof token === 'string' ? { kind, token } : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupAccessibleNode(id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    ...(focused ? { focused } : {})
  };
}

function focusTarget(
  bounds: Rect,
  cursor?: { readonly row: number; readonly column: number }
): FocusTarget {
  return {
    bounds,
    ...(cursor === undefined ? {} : { cursor })
  };
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}

function writeBlock(buffer: FrameBuffer, bounds: Rect, text: string): void {
  writeRenderBlock(buffer, bounds, {
    lines: text.split('\n').map((lineText) => ({ spans: [{ text: lineText }] }))
  });
}

function writeRenderBlock(buffer: FrameBuffer, bounds: Rect, block: RenderBlock): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const lines = block.lines.slice(0, bounds.height);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const clipped = clipRenderLine(lines[offset] ?? { spans: [] }, bounds.width);
    buffer.writeLine(bounds.row + offset, bounds.column, clipped);
  }
}

function clipRenderLine(renderLine: RenderLine, maxCells: number): RenderLine {
  const spans: RenderSpan[] = [];
  let cells = 0;
  for (const currentSpan of renderLine.spans) {
    if (cells >= maxCells) break;
    const clippedText = clipSpanText(currentSpan.text, maxCells - cells);
    if (clippedText.length === 0) continue;
    spans.push({
      text: clippedText,
      ...(currentSpan.style === undefined ? {} : { style: currentSpan.style }),
      ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
      ...(currentSpan.source === undefined ? {} : { source: currentSpan.source })
    });
    cells += measureTextCells(clippedText).cells;
  }
  return { spans: Object.freeze(spans) };
}

function clipSpanText(text: string, maxCells: number): string {
  return clipTextCells(text, maxCells).text;
}

function progressText(widget: Widget, theme: TerminalTheme): string {
  const label = stringify(widget.props['label']);
  const prefix = label.length === 0 ? '' : `${label} `;
  if (widget.props['indeterminate'] === true || widget.props['value'] === undefined) {
    return `${prefix}[${theme.symbols.progressEmpty.repeat(10)}]`;
  }
  const value = numberProp(widget, 'value');
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  if (value === undefined) return `${prefix}[${theme.symbols.progressEmpty.repeat(10)}]`;
  const clamped = Math.max(0, Math.min(max, value));
  const filled = Math.round((clamped / max) * 10);
  return `${prefix}[${theme.symbols.progressFilled.repeat(filled)}${theme.symbols.progressEmpty.repeat(10 - filled)}] ${String(clamped)}/${String(max)}`;
}

function listText(widget: Widget, height: number, theme: TerminalTheme): string {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, height, selected);
  return items
    .slice(window.start, window.end)
    .map((item, index) => {
      const itemIndex = window.start + index;
      return `${itemIndex === selected ? theme.symbols.pointer : theme.symbols.unselected} ${String(item)}`;
    })
    .join('\n');
}

function accessibleProgressNode(widget: Widget, id: string): AccessibleNode {
  const label = stringify(widget.props['label']) || id;
  if (widget.props['indeterminate'] === true || widget.props['value'] === undefined) {
    return {
      id,
      role: 'progressbar',
      label,
      progress: { indeterminate: true }
    };
  }
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  const rawValue = numberProp(widget, 'value') ?? 0;
  const value = Math.max(0, Math.min(max, rawValue));
  return {
    id,
    role: 'progressbar',
    label,
    progress: { value, max }
  };
}

function listAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, items.length),
    ...(focused ? { focused } : {})
  };
}

function listAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, index) => {
    const itemIndex = window.start + index;
    return {
      id: `${widget.id ?? 'list'}:option:${String(itemIndex)}`,
      role: 'option',
      label: String(item),
      selected: itemIndex === selected
    };
  });
}

function filteredListItems(widget: Widget): readonly unknown[] {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const query = stringify(widget.props['filterQuery']).trim().toLocaleLowerCase();
  if (query.length === 0) return items;
  return items.filter((item) => String(item).toLocaleLowerCase().includes(query));
}

function listWindow(widget: Widget, count: number, height: number, selected: number) {
  const scroll = widget.props['scroll'];
  if (typeof scroll === 'object' && scroll !== null) {
    return visibleWindowFromScroll(normalizeScrollState({
      ...scroll as Parameters<typeof normalizeScrollState>[0],
      contentRows: count,
      viewportRows: height
    }));
  }
  return visibleWindow(count, height, selected);
}

function gridChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const rows = layoutSizes(widget.props['rows']);
  const columns = layoutSizes(widget.props['columns']);
  const cells = gridCellRects(
    bounds,
    rows.length === 0 ? [{ kind: 'fill' }] : rows,
    columns.length === 0 ? [{ kind: 'fill' }] : columns,
    gridLayoutOptions(widget)
  );
  return (widget.children ?? []).map((_child, index) => cells[index] ?? emptyRect(bounds));
}

function splitPaneChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const children = widget.children ?? [];
  const explicit = layoutSizes(widget.props['sizes']);
  const tracks = explicit.length === children.length ? explicit : children.map(() => ({ kind: 'fill' as const }));
  const direction = widget.props['direction'] === 'horizontal' ? 'horizontal' : 'vertical';
  return splitTracks(bounds, direction, tracks, layoutFlowOptions(widget));
}

function tabsChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
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

function tabsHeaderText(widget: Widget): string {
  const tabs = tabItems(widget);
  const selected = selectedTabIndex(widget, tabs);
  return tabs.map((tab, index) => `${index === selected ? '[' : ' '}${tab.label}${index === selected ? ']' : ' '}`).join(' ');
}

function tabsAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
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

function modalChildBounds(widget: Widget, bounds: Rect): Rect {
  const width = Math.min(bounds.width, Math.max(4, Math.floor(numberProp(widget, 'width') ?? Math.min(bounds.width, 60))));
  const height = Math.min(bounds.height, Math.max(3, Math.floor(numberProp(widget, 'height') ?? Math.min(bounds.height, 20))));
  return clampRect({
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    width,
    height
  });
}

function layoutSizes(value: unknown): readonly LayoutSize[] {
  return Array.isArray(value)
    ? value.flatMap((track): LayoutSize[] => {
        if (typeof track !== 'object' || track === null) return [];
        const kind = (track as { readonly kind?: unknown }).kind;
        if (kind === 'fixed') {
          const cells = (track as { readonly cells?: unknown }).cells;
          return typeof cells === 'number' ? [{ kind, cells }] : [];
        }
        if (kind === 'percent') {
          const value = (track as { readonly value?: unknown }).value;
          return typeof value === 'number' ? [{ kind, value }] : [];
        }
        if (kind === 'fill') {
          const weight = (track as { readonly weight?: unknown }).weight;
          return typeof weight === 'number' ? [{ kind, weight }] : [{ kind }];
        }
        if (kind === 'content') {
          const min = (track as { readonly min?: unknown }).min;
          const max = (track as { readonly max?: unknown }).max;
          return [{
            kind,
            ...(typeof min === 'number' ? { min } : {}),
            ...(typeof max === 'number' ? { max } : {})
          }];
        }
        return [];
      })
    : [];
}

function fillLayoutSizes(count: number): readonly LayoutSize[] {
  return Array.from({ length: Math.max(0, count) }, () => ({ kind: 'fill' }));
}

function gridLayoutOptions(widget: Widget): GridLayoutOptions {
  return {
    ...layoutFlowOptions(widget),
    ...optionalNumberProp(widget, 'rowGap'),
    ...optionalNumberProp(widget, 'columnGap')
  };
}

function layoutFlowOptions(widget: Widget): LayoutFlowOptions {
  return {
    ...optionalNumberProp(widget, 'gap'),
    ...optionalInsetProp(widget, 'padding'),
    ...optionalInsetProp(widget, 'margin'),
    ...optionalNumberProp(widget, 'minWidth'),
    ...optionalNumberProp(widget, 'minHeight'),
    ...optionalNumberProp(widget, 'maxWidth'),
    ...optionalNumberProp(widget, 'maxHeight'),
    ...optionalAlignmentProp(widget),
    ...optionalJustificationProp(widget),
    ...optionalOverflowProp(widget)
  };
}

function optionalNumberProp(widget: Widget, key: string): Record<string, number> {
  const value = widget.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
}

function optionalInsetProp(widget: Widget, key: string): Record<string, LayoutInsetInput> {
  const value = widget.props[key];
  if (typeof value === 'number' && Number.isFinite(value)) return { [key]: value };
  if (!isInsetObject(value)) return {};
  return { [key]: value };
}

function optionalAlignmentProp(widget: Widget): { readonly align?: LayoutAlignment } {
  const value = widget.props['align'];
  return isLayoutAlignment(value) ? { align: value } : {};
}

function optionalJustificationProp(widget: Widget): { readonly justify?: LayoutJustification } {
  const value = widget.props['justify'];
  return isLayoutJustification(value) ? { justify: value } : {};
}

function optionalOverflowProp(widget: Widget): { readonly overflow?: LayoutOverflow } {
  const value = widget.props['overflow'];
  return isLayoutOverflow(value) ? { overflow: value } : {};
}

function isLayoutAlignment(value: unknown): value is LayoutAlignment {
  return value === 'start' || value === 'center' || value === 'end' || value === 'stretch';
}

function isLayoutJustification(value: unknown): value is LayoutJustification {
  return value === 'start' || value === 'center' || value === 'end' || value === 'stretch';
}

function isLayoutOverflow(value: unknown): value is LayoutOverflow {
  return value === 'clip' || value === 'visible';
}

function isInsetObject(value: unknown): value is Exclude<LayoutInsetInput, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return insetFieldIsValid(record['top'])
    && insetFieldIsValid(record['right'])
    && insetFieldIsValid(record['bottom'])
    && insetFieldIsValid(record['left']);
}

function insetFieldIsValid(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function tabItems(widget: Widget): readonly {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}[] {
  if (!Array.isArray(widget.props['tabs'])) return [];
  return widget.props['tabs'].filter((tab): tab is { readonly id: string; readonly label: string; readonly disabled?: boolean } =>
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

function viewportAccessibleDescription(widget: Widget, node: LayoutNode): string {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(node.bounds.height + scrollRow, nonNegativeInteger(numberProp(widget, 'contentRows')));
  const contentColumns = Math.max(
    node.bounds.width + scrollColumn,
    nonNegativeInteger(numberProp(widget, 'contentColumns'))
  );
  const rowEnd = Math.min(contentRows, scrollRow + node.bounds.height);
  const columnEnd = Math.min(contentColumns, scrollColumn + node.bounds.width);
  return `Showing rows ${String(scrollRow + 1)}-${String(rowEnd)} of ${String(contentRows)}, columns ${String(scrollColumn + 1)}-${String(columnEnd)} of ${String(contentColumns)}.`;
}

function viewportChildBounds(widget: Widget, bounds: Rect): Rect {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(bounds.height + scrollRow, nonNegativeInteger(numberProp(widget, 'contentRows')));
  const contentColumns = Math.max(bounds.width + scrollColumn, nonNegativeInteger(numberProp(widget, 'contentColumns')));
  return {
    row: bounds.row - scrollRow,
    column: bounds.column - scrollColumn,
    width: contentColumns,
    height: contentRows
  };
}

function listCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || items.length === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = visibleWindow(items.length, bounds.height, selected);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

function inset(bounds: Rect, amount: number): Rect {
  return clampRect({
    row: bounds.row + amount,
    column: bounds.column + amount,
    width: bounds.width - amount * 2,
    height: bounds.height - amount * 2
  });
}

function emptyRect(bounds: Rect): Rect {
  return { row: bounds.row, column: bounds.column, width: 0, height: 0 };
}

function clampRect(bounds: Rect): Rect {
  return {
    row: Math.max(1, bounds.row),
    column: Math.max(1, bounds.column),
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height)
  };
}

function cellInside(cell: FrameCell, bounds: Rect): boolean {
  return cell.row >= bounds.row
    && cell.row < bounds.row + bounds.height
    && cell.column >= bounds.column
    && cell.column < bounds.column + bounds.width;
}

function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}
