import { clipTextCells, sanitizeTerminalText } from '../text/index.ts';
import { stringify } from './widget-props.ts';
import { widgetStyle } from './widget-style.ts';
import { visibleWindow, windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TreeNode, Widget } from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import type { RenderBlock, RenderLine, TerminalStyle } from './render-primitives.ts';
import type { ScrollState } from './scroll.ts';
import type { HitTarget } from './widget-renderer.ts';

export type TreeAction =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' };

export function treeReducer(nodes: readonly TreeNode[], action: TreeAction): readonly TreeNode[] {
  return nodes.map((node) => reduceNode(node, action));
}

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
      lines: [{ spans: [styledSpan(emptyText(widget), widgetStyle(widget, 'placeholder'))] }]
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
    ...(focused ? { focused } : {})
  };
}

export function treeAccessibleChildren(widget: Widget, bounds: Rect): readonly AccessibleNode[] {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  return window.rows.map((row) => ({
    id: `${widget.id ?? 'tree'}:${row.node.id}`,
    role: 'option',
    label: row.node.label,
    selected: row.node.id === selected,
    disabled: row.node.disabled === true || row.lazyPlaceholder === true,
    ...(row.node.children === undefined && row.node.lazy !== true ? {} : { expanded: row.node.expanded === true }),
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
      message: toMessage(row.node),
      cursor: 'pointer'
    }];
  });
}

function reduceNode(node: TreeNode, action: TreeAction): TreeNode {
  const children = node.children?.map((child) => reduceNode(child, action));
  const base = children === undefined ? node : { ...node, children };
  if (action.kind === 'expandAll') return { ...base, expanded: true };
  if (action.kind === 'collapseAll') return { ...base, expanded: false };
  if (node.id !== action.id) return base;
  if (action.kind === 'toggle') return { ...base, expanded: node.expanded !== true };
  if (action.kind === 'expand') return { ...base, expanded: true };
  return { ...base, expanded: false };
}

function treeLine(widget: Widget, row: VisibleTreeNode, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
  const marker = row.node.id === selected ? theme.symbols.pointer : theme.symbols.unselected;
  const branch = branchSymbol(row.node, row.lazyPlaceholder === true, theme);
  const icon = row.node.icon === undefined ? '' : `${row.node.icon} `;
  const label = row.lazyPlaceholder === true ? 'Loading…' : row.node.label;
  const text = `${marker} ${'  '.repeat(row.depth)}${branch} ${icon}${label}`;
  const style = treeNodeStyle(widget, row, row.node.id === selected);
  return {
    spans: [{
      text: clipTextCells(text, Math.max(0, width), { ellipsis: '…' }).text,
      ...(style === undefined ? {} : { style })
    }]
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

function styledSpan(text: string, style: TerminalStyle | undefined): RenderLine['spans'][number] {
  return style === undefined ? { text } : { text, style };
}

function visibleTreeNodes(widget: Widget): readonly VisibleTreeNode[] {
  const roots = treeNodes(widget.props['nodes']);
  const query = clean(stringify(widget.props['filterQuery'])).trim().toLocaleLowerCase();
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
      rows.push({ node: { id: `${node.id}:lazy`, label: 'Loading…', disabled: true }, depth: depth + 1, path: [...path, 'lazy'], lazyPlaceholder: true });
    } else {
      rows.push(...descendantRows);
    }
  }
  return true;
}

function nodeMatches(node: TreeNode, query: string): boolean {
  const values = [
    node.id,
    node.label,
    node.icon,
    ...metadataValues(node.metadata)
  ].filter((value): value is string => value !== undefined);
  return values.some((value) => value.toLocaleLowerCase().includes(query));
}

function metadataValues(metadata: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  if (metadata === undefined) return [];
  return Object.values(metadata).flatMap((value): string[] => typeof value === 'string' ? [value] : []);
}

function treeWindow(widget: Widget, rows: readonly VisibleTreeNode[], height: number, selected: string | undefined): TreeWindow {
  const scroll = scrollProp(widget);
  if (scroll !== undefined) {
    const start = Math.max(0, Math.min(rows.length, Math.floor(scroll.offsetRow)));
    const end = Math.min(rows.length, start + Math.max(0, height));
    return { rows: rows.slice(start, end), start, end };
  }
  const selectedIndex = selectedTreeIndex(rows, selected) ?? 0;
  const window = visibleWindow(rows.length, height, selectedIndex);
  return {
    rows: rows.slice(window.start, window.end),
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
  const expanded = value['expanded'];
  const disabled = value['disabled'];
  const lazy = value['lazy'];
  const icon = value['icon'];
  const metadata = value['metadata'];
  return [{
    id: clean(id),
    label: clean(label),
    ...(Array.isArray(children) ? { children: children.flatMap((child): readonly TreeNode[] => sanitizeNode(child)) } : {}),
    ...(expanded === undefined ? {} : { expanded: expanded === true }),
    ...(disabled === undefined ? {} : { disabled: disabled === true }),
    ...(lazy === undefined ? {} : { lazy: lazy === true }),
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

function scrollProp(widget: Widget): ScrollState | undefined {
  const scroll = widget.props['scroll'];
  if (!isRecord(scroll)) return undefined;
  const offsetRow = scroll['offsetRow'];
  const offsetColumn = scroll['offsetColumn'];
  const contentRows = scroll['contentRows'];
  const contentColumns = scroll['contentColumns'];
  const viewportRows = scroll['viewportRows'];
  const viewportColumns = scroll['viewportColumns'];
  const followTail = scroll['followTail'];
  if (
    typeof offsetRow !== 'number'
    || typeof offsetColumn !== 'number'
    || typeof contentRows !== 'number'
    || typeof contentColumns !== 'number'
    || typeof viewportRows !== 'number'
    || typeof viewportColumns !== 'number'
    || typeof followTail !== 'boolean'
  ) return undefined;
  return { offsetRow, offsetColumn, contentRows, contentColumns, viewportRows, viewportColumns, followTail };
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

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTreeMessageFactory(value: unknown): value is (node: TreeNode) => unknown {
  return typeof value === 'function';
}
