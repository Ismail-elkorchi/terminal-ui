import { sanitizeTerminalText } from '../text/index.ts';
import { treeNodeMatches } from '../widgets/behavior/tree.ts';
import { dataSource, dataSpan, dataValueSpans, mergeDataStyles, selectionMarkerSpans } from './data-visual.ts';
import { rowWindow, scrollStateFromUnknown } from './data-window.ts';
import { stringify } from './widget-props.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
import { windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TreeNode, Widget } from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import { clipRenderSpans } from './render-primitives.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { ScrollState } from './scroll.ts';
import type { HitTarget } from './widget-renderer.ts';

interface VisibleTreeNode {
  readonly node: TreeNode;
  readonly depth: number;
  readonly path: readonly string[];
  readonly lazyPlaceholder?: boolean;
}

interface TreeWindow {
  readonly rows: readonly VisibleTreeNode[];
  readonly start: number;
  readonly end: number;
}

export function treeBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  if (rows.length === 0 && bounds.height > 0) {
    return {
      lines: [{
        spans: [dataSpan(emptyText(widget), widgetStyle(widget, 'placeholder'), treeSource(widget, 'empty'))]
      }]
    };
  }
  return {
    lines: window.rows.map((row) => treeLine(widget, row, selected, bounds.width, theme))
  };
}

export function treeAccessibleBase(widget: Widget, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('tree rows', window, rows.length),
    window: {
      start: window.start,
      end: window.end,
      total: rows.length,
      omittedBefore: window.start,
      omittedAfter: Math.max(0, rows.length - window.end)
    },
    ...(focused ? { focused } : {})
  };
}

export function treeAccessibleChildren(widget: Widget, bounds: Rect): readonly AccessibleNode[] {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  return window.rows.map((row, index) => ({
    id: `${widget.id ?? 'tree'}:${row.node.id}`,
    role: 'option',
    label: row.node.label,
    ...(row.node.description === undefined ? {} : { description: row.node.description }),
    selected: row.node.id === selected,
    disabled: row.node.disabled === true || row.lazyPlaceholder === true,
    ...(row.node.children === undefined && row.node.lazy !== true ? {} : { expanded: row.node.expanded === true }),
    position: {
      index: window.start + index,
      count: rows.length,
      level: row.depth + 1
    },
    value: row.path.join('/')
  }));
}

export function treeHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toMessageProp(widget);
  if (toMessage === undefined) return [];
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  return window.rows.flatMap((row, index): HitTarget<TMessage>[] => {
    if (row.lazyPlaceholder === true || row.node.disabled === true) return [];
    return [{
      id: `${widget.id ?? 'tree'}:${row.node.id}`,
      bounds: {
        row: bounds.row + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: () => toMessage(row.node),
      cursor: 'pointer'
    }];
  });
}

function treeLine(widget: Widget, row: VisibleTreeNode, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
  const isSelected = row.node.id === selected;
  const branch = branchSymbol(row.node, row.lazyPlaceholder === true, theme);
  const icon = row.node.icon === undefined ? '' : `${row.node.icon} `;
  const label = row.node.label;
  const style = treeNodeStyle(widget, row, isSelected);
  const branchStyle = mergeDataStyles(themeStyle('tree.branch'), style);
  const query = filterQuery(widget);
  const nodeSourceId = `${widget.id ?? 'tree'}:${row.node.id}`;
  const spans: RenderSpan[] = [
    ...selectionMarkerSpans(
      widget,
      isSelected,
      theme,
      style,
      treeSource(widget, `node.${row.node.id}.marker`, nodeSourceId, 'decoration')
    ),
    ...(row.depth === 0 ? [] : [dataSpan('  '.repeat(row.depth), branchStyle, treeSource(widget, `node.${row.node.id}.indent`, nodeSourceId, 'decoration'))]),
    dataSpan(branch, branchStyle, treeSource(widget, `node.${row.node.id}.branch`, nodeSourceId, 'decoration')),
    dataSpan(' ', undefined, treeSource(widget, `node.${row.node.id}.branch.gap`, nodeSourceId, 'decoration')),
    ...(icon.length === 0 ? [] : [dataSpan(icon, branchStyle, treeSource(widget, `node.${row.node.id}.icon`, nodeSourceId, 'decoration'))]),
    ...dataValueSpans(label, query, style, {
      source: treeSource(widget, `node.${row.node.id}.label`, nodeSourceId),
      matchSource: treeSource(widget, `node.${row.node.id}.match`, nodeSourceId)
    })
  ];
  return {
    spans: clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…' })
  };
}

function branchSymbol(node: TreeNode, lazyPlaceholder: boolean, theme: TerminalTheme): string {
  if (lazyPlaceholder) return theme.symbols.unselected;
  if ((node.children === undefined || node.children.length === 0) && node.lazy !== true) return theme.symbols.unselected;
  return node.expanded === true ? theme.symbols.treeExpanded : theme.symbols.treeCollapsed;
}

function treeNodeStyle(widget: Widget, row: VisibleTreeNode, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return widgetStyle(widget, 'placeholder');
  if (row.node.disabled === true) return widgetStyle(widget, 'value', 'disabled');
  if (selected) return widgetStyle(widget, 'value', 'selected');
  return undefined;
}

function visibleTreeNodes(widget: Widget): readonly VisibleTreeNode[] {
  const roots = treeNodes(widget.props['nodes']);
  const query = filterQuery(widget).toLocaleLowerCase();
  const rows: VisibleTreeNode[] = [];
  for (const node of roots) collectVisibleTreeNode(rows, node, 0, [], query);
  return rows;
}

function collectVisibleTreeNode(
  rows: VisibleTreeNode[],
  node: TreeNode,
  depth: number,
  parentPath: readonly string[],
  query: string
): boolean {
  const path = [...parentPath, node.id];
  const selfMatches = query.length === 0 || nodeMatches(node, query);
  const descendantRows: VisibleTreeNode[] = [];
  let descendantMatches = false;
  for (const child of node.children ?? []) {
    descendantMatches = collectVisibleTreeNode(descendantRows, child, depth + 1, path, query) || descendantMatches;
  }
  if (!selfMatches && !descendantMatches) return false;
  rows.push({ node, depth, path });
  if (query.length > 0) {
    rows.push(...descendantRows);
  } else if (node.expanded === true) {
    if (node.lazy === true && (node.children === undefined || node.children.length === 0)) {
      rows.push({
        node: {
          id: `${node.id}:lazy`,
          label: lazyPlaceholderLabel(node),
          disabled: true,
          ...(node.lazyStatus === undefined ? {} : { lazyStatus: node.lazyStatus })
        },
        depth: depth + 1,
        path: [...path, 'lazy'],
        lazyPlaceholder: true
      });
    } else {
      rows.push(...descendantRows);
    }
  }
  return true;
}

function nodeMatches(node: TreeNode, query: string): boolean {
  return treeNodeMatches(node, query);
}

function treeWindow(widget: Widget, rows: readonly VisibleTreeNode[], height: number, selected: string | undefined): TreeWindow {
  const selectedIndex = selectedTreeIndex(rows, selected) ?? 0;
  const window = rowWindow(rows, {
    viewportRows: height,
    selectedIndex,
    ...scrollInput(widget)
  });
  return {
    rows: window.rows,
    start: window.start,
    end: window.end
  };
}

function treeNodes(value: unknown): readonly TreeNode[] {
  return Array.isArray(value) ? value.flatMap((node): readonly TreeNode[] => sanitizeNode(node)) : [];
}

function sanitizeNode(value: unknown): readonly TreeNode[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const children = value['children'];
  const description = value['description'];
  const expanded = value['expanded'];
  const disabled = value['disabled'];
  const lazy = value['lazy'];
  const lazyStatus = value['lazyStatus'];
  const lazyMessage = value['lazyMessage'];
  const icon = value['icon'];
  const metadata = value['metadata'];
  return [{
    id: clean(id),
    label: clean(label),
    ...(typeof description === 'string' ? { description: clean(description) } : {}),
    ...(Array.isArray(children) ? { children: children.flatMap((child): readonly TreeNode[] => sanitizeNode(child)) } : {}),
    ...(expanded === undefined ? {} : { expanded: expanded === true }),
    ...(disabled === undefined ? {} : { disabled: disabled === true }),
    ...(lazy === undefined ? {} : { lazy: lazy === true }),
    ...(lazyStatus === 'pending' || lazyStatus === 'error' || lazyStatus === 'empty' ? { lazyStatus } : {}),
    ...(typeof lazyMessage === 'string' ? { lazyMessage: clean(lazyMessage) } : {}),
    ...(typeof icon === 'string' ? { icon: clean(icon) } : {}),
    ...(isRecord(metadata) ? { metadata: sanitizeMetadata(metadata) } : {})
  }];
}

function sanitizeMetadata(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [
    clean(key),
    typeof value === 'string' ? clean(value) : value
  ]));
}

function selectedTreeId(widget: Widget): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedTreeIndex(rows: readonly VisibleTreeNode[], selected: string | undefined): number | undefined {
  if (selected === undefined) return undefined;
  const index = rows.findIndex((row) => row.node.id === selected);
  return index === -1 ? undefined : index;
}

function scrollInput(widget: Widget): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props['scroll']);
  return scroll === undefined ? {} : { scroll };
}

function toMessageProp<TMessage>(widget: Widget<TMessage>): ((node: TreeNode) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isTreeMessageFactory(toMessage)) return undefined;
  return (node) => toMessage(node) as TMessage;
}

function emptyText(widget: Widget): string {
  const text = clean(stringify(widget.props['emptyText']));
  return text.length === 0 ? 'No nodes' : text;
}

function filterQuery(widget: Widget): string {
  return clean(stringify(widget.props['filterQuery'])).trim();
}

function lazyPlaceholderLabel(node: TreeNode): string {
  if (node.lazyStatus === 'error') return node.lazyMessage ?? 'Load failed';
  if (node.lazyStatus === 'empty') return node.lazyMessage ?? 'No children';
  return node.lazyMessage ?? 'Loading…';
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTreeMessageFactory(value: unknown): value is (node: TreeNode) => unknown {
  return typeof value === 'function';
}

function treeSource(widget: Widget, label: string, id?: string, role: FrameCellSource['role'] = 'text'): FrameCellSource {
  return dataSource(widget, label, {
    ...(id === undefined ? {} : { itemId: id }),
    role
  });
}
