import { clipTextCells, measureTextCells } from '../text/index.ts';
import { commandPaletteWindow } from './command-surface.ts';
import { gridCellRects, splitTracks } from './regions.ts';
import { visibleWindow, windowDescription } from './visible-window.ts';
import {
  scrollbackAccessibleBase,
  scrollbackAccessibleChildren,
  scrollbackText
} from './scrollback.ts';
import {
  activityFeedAccessibleBase,
  activityFeedAccessibleChildren,
  activityFeedText,
  structuredBlockAccessibleBase,
  structuredBlockText
} from './structured-block.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget, WidgetKind } from '../widgets/index.ts';
import type { FrameCell } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { LayoutTrack } from './regions.ts';

export interface WidgetBehavior {
  readonly childBounds?: (widget: Widget, bounds: Rect) => readonly Rect[];
  readonly render?: (widget: Widget, node: LayoutNode, context: WidgetRenderContext) => WidgetRenderResult;
  readonly accessibleBase?: (
    widget: Widget,
    node: LayoutNode,
    id: string,
    focused: boolean
  ) => AccessibleNode;
  readonly accessibleChildren?: (widget: Widget, node: LayoutNode) => readonly AccessibleNode[] | undefined;
  readonly cursor?: (widget: Widget, target: WidgetLayoutTarget) => { readonly row: number; readonly column: number } | undefined;
  readonly focusable?: (widget: Widget) => boolean;
}

export interface WidgetRenderContext {
  readonly cells: FrameCell[];
  renderChildren(target?: FrameCell[]): void;
}

export type WidgetRenderResult = 'skipChildren' | undefined;

export interface WidgetLayoutTarget {
  readonly bounds: Rect;
}

const widgetBehaviors = {
  text: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, stringify(widget.props['content']));
      return undefined;
    },
    accessibleBase: (widget, _node, id) => ({
      id,
      role: 'text',
      label: id,
      value: stringify(widget.props['content'])
    })
  },
  statusBar: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, stringify(widget.props['text']));
      return undefined;
    },
    accessibleBase: (widget, _node, id) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['text'])
    })
  },
  inputField: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, stringify(widget.props['value']));
      return undefined;
    },
    accessibleBase: (widget, _node, id, focused) => ({
      id,
      role: 'textbox',
      label: id,
      value: stringify(widget.props['value']),
      ...(focused ? { focused } : {})
    }),
    focusable: () => true
  },
  spinner: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, `${stringify(widget.props['label']) || 'Loading'} ...`);
      return undefined;
    },
    accessibleBase: (widget, _node, id) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['label']) || 'Loading'
    })
  },
  progressBar: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, progressText(widget));
      return undefined;
    },
    accessibleBase: (widget, _node, id) => accessibleProgressNode(widget, id)
  },
  list: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, listText(widget, node.bounds.height));
      return undefined;
    },
    accessibleBase: (widget, node, id, focused) => listAccessibleNode(widget, node, id, focused),
    accessibleChildren: (widget, node) => listAccessibleChildren(widget, node),
    cursor: listCursor,
    focusable: () => true
  },
  table: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, tableText(widget, node.bounds.height));
      return undefined;
    },
    accessibleBase: (widget, node, id, focused) => tableAccessibleNode(widget, node, id, focused),
    accessibleChildren: (widget, node) => tableAccessibleChildren(widget, node)
  },
  box: {
    childBounds: (widget, bounds) => (widget.children ?? []).map(() => inset(bounds, 1)),
    render: (_widget, node, context) => {
      drawBox(context.cells, node.bounds);
      return undefined;
    }
  },
  row: {
    childBounds: (widget, bounds) => splitHorizontal(bounds, widget.children?.length ?? 0)
  },
  stack: {},
  viewport: {
    childBounds: (widget, bounds) => [viewportChildBounds(widget, bounds)],
    render: (_widget, node, context) => {
      const viewportCells: FrameCell[] = [];
      context.renderChildren(viewportCells);
      context.cells.push(...viewportCells.filter((cell) => cellInside(cell, node.bounds)));
      return 'skipChildren';
    },
    accessibleBase: (widget, node, id) => ({
      id,
      role: 'text',
      label: id,
      description: viewportAccessibleDescription(widget, node)
    })
  },
  scrollback: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, scrollbackText(widget, node));
      return undefined;
    },
    accessibleBase: (widget, node, id) => scrollbackAccessibleBase(widget, node, id),
    accessibleChildren: (widget, node) => scrollbackAccessibleChildren(widget, node)
  },
  structuredBlock: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, structuredBlockText(widget));
      return undefined;
    },
    accessibleBase: (widget, _node, id) => structuredBlockAccessibleBase(widget, id)
  },
  activityFeed: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, activityFeedText(widget, node));
      return undefined;
    },
    accessibleBase: (widget, node, id, focused) => activityFeedAccessibleBase(widget, node, id, focused),
    accessibleChildren: (widget, node) => activityFeedAccessibleChildren(widget, node)
  },
  commandBar: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, commandBarText(widget, node.bounds.height));
      return undefined;
    },
    accessibleBase: (widget, _node, id, focused) => ({
      id,
      role: 'textbox',
      label: stringify(widget.props['prompt']) || id,
      value: stringify(widget.props['value']),
      ...(focused ? { focused } : {})
    }),
    accessibleChildren: (widget) => commandBarAccessibleChildren(widget),
    cursor: commandBarCursor,
    focusable: () => true
  },
  commandPalette: {
    render: (widget, node, context) => {
      writeBlock(context.cells, node.bounds, commandPaletteText(widget, node.bounds.height));
      return undefined;
    },
    accessibleBase: (widget, _node, id, focused) => ({
      id,
      role: 'menu',
      label: stringify(widget.props['title']) || id,
      value: stringify(widget.props['query']),
      ...(focused ? { focused } : {})
    }),
    accessibleChildren: (widget, node) => commandPaletteAccessibleChildren(widget, node),
    focusable: () => true
  },
  grid: {
    childBounds: (widget, bounds) => gridChildBounds(widget, bounds)
  },
  splitPane: {
    childBounds: (widget, bounds) => splitPaneChildBounds(widget, bounds)
  },
  tabs: {
    childBounds: (widget, bounds) => tabsChildBounds(widget, bounds),
    render: (widget, node, context) => {
      writeBlock(context.cells, { ...node.bounds, height: Math.min(1, node.bounds.height) }, tabsHeaderText(widget));
      return undefined;
    },
    accessibleBase: (_widget, _node, id, focused) => ({
      id,
      role: 'menu',
      label: id,
      ...(focused ? { focused } : {})
    }),
    accessibleChildren: (widget) => tabsAccessibleChildren(widget)
  },
  modal: {
    childBounds: (widget, bounds) => [inset(modalChildBounds(widget, bounds), 1)],
    render: (widget, node, context) => {
      drawBox(context.cells, modalChildBounds(widget, node.bounds));
      const title = stringify(widget.props['title']);
      if (title.length > 0) {
        writeText(context.cells, modalChildBounds(widget, node.bounds).row, modalChildBounds(widget, node.bounds).column + 2, ` ${title} `);
      }
      return undefined;
    },
    accessibleBase: (widget, _node, id) => ({
      id,
      role: 'dialog',
      label: stringify(widget.props['title']) || id
    })
  },
  custom: {}
} satisfies Record<WidgetKind, WidgetBehavior>;

export function widgetBehavior(kind: WidgetKind): WidgetBehavior {
  return widgetBehaviors[kind];
}

export function layoutChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const children = widget.children ?? [];
  if (children.length === 0) return [];
  if (bounds.width <= 0 || bounds.height <= 0) return children.map(() => emptyRect(bounds));
  return widgetBehavior(widget.kind).childBounds?.(widget, bounds) ?? splitVertical(bounds, children.length);
}

export function isWidgetFocusable(widget: Widget): boolean {
  return widgetBehavior(widget.kind).focusable?.(widget)
    ?? (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0);
}

export function renderWidgetBehavior(
  widget: Widget,
  node: LayoutNode,
  context: WidgetRenderContext
): WidgetRenderResult {
  return widgetBehavior(widget.kind).render?.(widget, node, context);
}

export function widgetAccessibleBaseNode(
  widget: Widget,
  node: LayoutNode,
  id: string,
  focused: boolean
): AccessibleNode {
  return widgetBehavior(widget.kind).accessibleBase?.(widget, node, id, focused)
    ?? { id, role: 'text', label: id, ...(focused ? { focused } : {}) };
}

export function widgetAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] | undefined {
  return widgetBehavior(widget.kind).accessibleChildren?.(widget, node);
}

export function widgetCursor(
  widget: Widget,
  target: WidgetLayoutTarget
): { readonly row: number; readonly column: number } | undefined {
  return widgetBehavior(widget.kind).cursor?.(widget, target);
}

function writeBlock(cells: FrameCell[], bounds: Rect, text: string): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const lines = text.split('\n').slice(0, bounds.height);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const line = clipTextCells(lines[offset] ?? '', bounds.width).text;
    writeText(cells, bounds.row + offset, bounds.column, line);
  }
}

function writeText(cells: FrameCell[], row: number, column: number, text: string): void {
  let nextColumn = column;
  for (const segment of measureTextCells(text).graphemes) {
    cells.push({ row, column: nextColumn, text: segment.text });
    nextColumn += segment.cells;
  }
}

function drawBox(cells: FrameCell[], bounds: Rect): void {
  if (bounds.width < 2 || bounds.height < 2) return;
  const top = `┌${'─'.repeat(Math.max(0, bounds.width - 2))}┐`;
  const bottom = `└${'─'.repeat(Math.max(0, bounds.width - 2))}┘`;
  writeText(cells, bounds.row, bounds.column, top);
  for (let row = bounds.row + 1; row < bounds.row + bounds.height - 1; row += 1) {
    writeText(cells, row, bounds.column, '│');
    writeText(cells, row, bounds.column + bounds.width - 1, '│');
  }
  writeText(cells, bounds.row + bounds.height - 1, bounds.column, bottom);
}

function progressText(widget: Widget): string {
  const label = stringify(widget.props['label']);
  const prefix = label.length === 0 ? '' : `${label} `;
  if (widget.props['indeterminate'] === true || widget.props['value'] === undefined) {
    return `${prefix}[----------]`;
  }
  const value = numberProp(widget, 'value');
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  if (value === undefined) return `${prefix}[----------]`;
  const clamped = Math.max(0, Math.min(max, value));
  const filled = Math.round((clamped / max) * 10);
  return `${prefix}[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}] ${String(clamped)}/${String(max)}`;
}

function listText(widget: Widget, height: number): string {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, height, selected);
  return items
    .slice(window.start, window.end)
    .map((item, index) => {
      const itemIndex = window.start + index;
      return `${itemIndex === selected ? '›' : ' '} ${String(item)}`;
    })
    .join('\n');
}

function tableText(widget: Widget, height: number): string {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const window = visibleWindow(rows.length, height, 0);
  return rows
    .slice(window.start, window.end)
    .map((row) => Array.isArray(row) ? row.map(String).join('  ') : String(row))
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
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, items.length),
    ...(focused ? { focused } : {})
  };
}

function tableAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const window = visibleWindow(rows.length, node.bounds.height, 0);
  return {
    id,
    role: 'table',
    label: id,
    description: windowDescription('rows', window, rows.length),
    ...(focused ? { focused } : {})
  };
}

function listAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
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

function tableAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const window = visibleWindow(rows.length, node.bounds.height, 0);
  return rows.slice(window.start, window.end).map((row, index) => {
    const rowIndex = window.start + index;
    return {
      id: `${widget.id ?? 'table'}:row:${String(rowIndex)}`,
      role: 'row',
      children: tableCells(row, widget.id ?? 'table', rowIndex)
    };
  });
}

function tableCells(row: unknown, tableId: string, rowIndex: number): readonly AccessibleNode[] {
  const cells = Array.isArray(row) ? row : [row];
  return cells.map((cell, cellIndex) => ({
    id: `${tableId}:row:${String(rowIndex)}:cell:${String(cellIndex)}`,
    role: 'cell',
    label: String(cell),
    value: String(cell)
  }));
}

function commandBarText(widget: Widget, height: number): string {
  const prompt = stringify(widget.props['prompt']) || '> ';
  const value = stringify(widget.props['value']);
  const placeholder = stringify(widget.props['placeholder']);
  const display = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  const suggestions = commandBarSuggestions(widget);
  const selected = nonNegativeInteger(numberProp(widget, 'selectedSuggestion'));
  const lines = [`${prompt}${display}`];
  if (height > 1) {
    lines.push(...suggestions.slice(0, Math.max(0, height - 1)).map((suggestion, index) => {
      const label = stringify(suggestion['label']) || stringify(suggestion['value']);
      const description = stringify(suggestion['description']);
      const suffix = description.length === 0 ? '' : ` - ${description}`;
      return `${index === selected ? '›' : ' '} ${label}${suffix}`;
    }));
  }
  return lines.join('\n');
}

function commandBarAccessibleChildren(widget: Widget): readonly AccessibleNode[] | undefined {
  const suggestions = commandBarSuggestions(widget);
  if (suggestions.length === 0) return undefined;
  const selected = nonNegativeInteger(numberProp(widget, 'selectedSuggestion'));
  return suggestions.map((suggestion, index) => ({
    id: `${widget.id ?? 'command-bar'}:suggestion:${String(index)}`,
    role: 'option',
    label: stringify(suggestion['label']) || stringify(suggestion['value']),
    value: stringify(suggestion['value']),
    selected: index === selected
  }));
}

function commandBarCursor(widget: Widget, target: WidgetLayoutTarget): { readonly row: number; readonly column: number } {
  const prompt = stringify(widget.props['prompt']) || '> ';
  const value = stringify(widget.props['value']);
  const cursor = Math.max(0, Math.min(value.length, Math.floor(numberProp(widget, 'cursor') ?? value.length)));
  return { row: target.bounds.row, column: target.bounds.column + Math.max(0, Math.min(target.bounds.width - 1, prompt.length + cursor)) };
}

function commandPaletteText(widget: Widget, height: number): string {
  const title = stringify(widget.props['title']);
  const query = stringify(widget.props['query']);
  const helpText = stringify(widget.props['helpText']);
  const entries = commandPaletteEntries(widget);
  const maxVisible = numberProp(widget, 'maxVisible') ?? Math.max(1, height - 2);
  const selected = numberProp(widget, 'selected');
  const window = commandPaletteWindow({
    entries,
    query,
    ...(selected === undefined ? {} : { selected }),
    limit: Math.max(1, Math.min(maxVisible, Math.max(1, height - 2)))
  });
  const lines = [
    title.length === 0 ? 'Command palette' : title,
    `> ${query}`
  ];
  lines.push(...window.entries.map((entry, index) => {
    const suffix = entry.description === undefined ? '' : ` - ${entry.description}`;
    return `${index === window.selected ? '›' : ' '} ${entry.label}${suffix}`;
  }));
  if (helpText.length > 0 && lines.length < height) lines.push(helpText);
  return lines.slice(0, height).join('\n');
}

function commandPaletteAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const selected = numberProp(widget, 'selected');
  const window = commandPaletteWindow({
    entries: commandPaletteEntries(widget),
    query: stringify(widget.props['query']),
    ...(selected === undefined ? {} : { selected }),
    limit: Math.max(1, node.bounds.height - 2)
  });
  return window.entries.map((entry, index) => ({
    id: `${widget.id ?? 'command-palette'}:${entry.id}`,
    role: 'menuitem',
    label: entry.label,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    selected: index === window.selected,
    disabled: entry.disabled === true
  }));
}

function commandBarSuggestions(widget: Widget): readonly Record<string, unknown>[] {
  return Array.isArray(widget.props['suggestions']) ? widget.props['suggestions'] as readonly Record<string, unknown>[] : [];
}

function commandPaletteEntries(widget: Widget): readonly {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}[] {
  if (!Array.isArray(widget.props['entries'])) return [];
  return widget.props['entries'].filter((entry): entry is {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly keywords?: readonly string[];
    readonly disabled?: boolean;
  } => typeof entry === 'object'
    && entry !== null
    && typeof (entry as { readonly id?: unknown }).id === 'string'
    && typeof (entry as { readonly label?: unknown }).label === 'string');
}

function gridChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const rows = layoutTracks(widget.props['rows']);
  const columns = layoutTracks(widget.props['columns']);
  const cells = gridCellRects(bounds, rows.length === 0 ? [{ kind: 'fill' }] : rows, columns.length === 0 ? [{ kind: 'fill' }] : columns);
  return (widget.children ?? []).map((_child, index) => cells[index] ?? emptyRect(bounds));
}

function splitPaneChildBounds(widget: Widget, bounds: Rect): readonly Rect[] {
  const children = widget.children ?? [];
  const explicit = layoutTracks(widget.props['sizes']);
  const tracks = explicit.length === children.length ? explicit : children.map(() => ({ kind: 'fill' as const }));
  const direction = widget.props['direction'] === 'horizontal' ? 'horizontal' : 'vertical';
  return splitTracks(bounds, direction, tracks);
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

function layoutTracks(value: unknown): readonly LayoutTrack[] {
  return Array.isArray(value)
    ? value.flatMap((track): LayoutTrack[] => {
        if (typeof track !== 'object' || track === null) return [];
        const kind = (track as { readonly kind?: unknown }).kind;
        if (kind === 'fixed') {
          const size = (track as { readonly size?: unknown }).size;
          return typeof size === 'number' ? [{ kind, size }] : [];
        }
        if (kind === 'percent') {
          const percent = (track as { readonly percent?: unknown }).percent;
          return typeof percent === 'number' ? [{ kind, percent }] : [];
        }
        if (kind === 'fill') {
          const weight = (track as { readonly weight?: unknown }).weight;
          return typeof weight === 'number' ? [{ kind, weight }] : [{ kind }];
        }
        return [];
      })
    : [];
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

function listCursor(widget: Widget, target: WidgetLayoutTarget): { readonly row: number; readonly column: number } {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || items.length === 0 || target.bounds.height <= 0) {
    return { row: target.bounds.row, column: target.bounds.column };
  }
  const window = visibleWindow(items.length, target.bounds.height, selected);
  const selectedRow = selected >= window.start && selected < window.end
    ? target.bounds.row + selected - window.start
    : target.bounds.row;
  return { row: selectedRow, column: target.bounds.column };
}

function splitVertical(bounds: Rect, count: number): readonly Rect[] {
  const base = Math.max(1, Math.floor(bounds.height / count));
  let row = bounds.row;
  return Array.from({ length: count }, (_value, index) => {
    const remaining = bounds.row + bounds.height - row;
    const height = index === count - 1 ? remaining : Math.min(base, remaining);
    const rect = { row, column: bounds.column, width: bounds.width, height: Math.max(0, height) };
    row += height;
    return clampRect(rect);
  });
}

function splitHorizontal(bounds: Rect, count: number): readonly Rect[] {
  const base = Math.max(1, Math.floor(bounds.width / count));
  let column = bounds.column;
  return Array.from({ length: count }, (_value, index) => {
    const remaining = bounds.column + bounds.width - column;
    const width = index === count - 1 ? remaining : Math.min(base, remaining);
    const rect = { row: bounds.row, column, width: Math.max(0, width), height: bounds.height };
    column += width;
    return clampRect(rect);
  });
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
