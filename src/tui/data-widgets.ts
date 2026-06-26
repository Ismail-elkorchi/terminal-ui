import { sanitizeTerminalText } from '../text/index.ts';
import { numberProp, stringify } from './widget-props.ts';
import { visibleWindow, windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TreeNode, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';

interface VisibleTreeNode {
  readonly node: TreeNode;
  readonly depth: number;
}

export function treeText(widget: Widget, node: LayoutNode): string {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = visibleWindow(rows.length, node.bounds.height, selectedTreeIndex(rows, selected) ?? 0);
  return rows.slice(window.start, window.end).map(({ node: item, depth }) => {
    const marker = item.id === selected ? '›' : ' ';
    const branch = item.children === undefined || item.children.length === 0 ? ' ' : item.expanded === true ? '▾' : '▸';
    return `${marker} ${'  '.repeat(depth)}${branch} ${sanitizeTerminalText(item.label).text}`;
  }).join('\n');
}

export function treeAccessibleBase(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = visibleWindow(rows.length, node.bounds.height, selectedTreeIndex(rows, selected) ?? 0);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('tree rows', window, rows.length),
    ...(focused ? { focused } : {})
  };
}

export function treeAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const rows = visibleTreeNodes(widget);
  const selected = selectedTreeId(widget);
  const window = visibleWindow(rows.length, node.bounds.height, selectedTreeIndex(rows, selected) ?? 0);
  return rows.slice(window.start, window.end).map(({ node: item }) => ({
    id: `${widget.id ?? 'tree'}:${item.id}`,
    role: 'option',
    label: sanitizeTerminalText(item.label).text,
    selected: item.id === selected,
    disabled: item.disabled === true,
    ...(item.children === undefined ? {} : { expanded: item.expanded === true })
  }));
}

export function paginatorText(widget: Widget): string {
  const pageCount = normalizedCount(numberProp(widget, 'pageCount') ?? 1);
  const page = Math.max(1, Math.min(pageCount, Math.floor(numberProp(widget, 'page') ?? 1)));
  const label = stringify(widget.props['label']);
  const prefix = label.length === 0 ? '' : `${label} `;
  return `${prefix}Page ${String(page)} of ${String(pageCount)}`;
}

export function paginatorAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: paginatorText(widget)
  };
}

function visibleTreeNodes(widget: Widget): readonly VisibleTreeNode[] {
  const roots = treeNodes(widget.props['nodes']);
  const rows: VisibleTreeNode[] = [];
  for (const node of roots) collectVisibleTreeNode(rows, node, 0);
  return rows;
}

function collectVisibleTreeNode(rows: VisibleTreeNode[], node: TreeNode, depth: number): void {
  rows.push({ node, depth });
  if (node.expanded !== true) return;
  for (const child of node.children ?? []) collectVisibleTreeNode(rows, child, depth + 1);
}

function treeNodes(value: unknown): readonly TreeNode[] {
  return Array.isArray(value) ? value.filter(isTreeNode).map(sanitizeNode) : [];
}

function isTreeNode(value: unknown): value is TreeNode {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly id?: unknown }).id === 'string'
    && typeof (value as { readonly label?: unknown }).label === 'string';
}

function sanitizeNode(node: TreeNode): TreeNode {
  return {
    id: sanitizeTerminalText(node.id).text,
    label: sanitizeTerminalText(node.label).text,
    ...(node.children === undefined ? {} : { children: node.children.filter(isTreeNode).map(sanitizeNode) }),
    ...(node.expanded === undefined ? {} : { expanded: node.expanded }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled })
  };
}

function selectedTreeId(widget: Widget): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? sanitizeTerminalText(selected).text : undefined;
}

function selectedTreeIndex(rows: readonly VisibleTreeNode[], selected: string | undefined): number | undefined {
  if (selected === undefined) return undefined;
  const index = rows.findIndex((row) => row.node.id === selected);
  return index === -1 ? undefined : index;
}

function normalizedCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}
