import type { RenderNode } from '../render-node/index.ts';
import type { RenderNodeVisualState } from '../render-node/index.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import { treeDisclosureAction, treeNodeCanDisclose, visibleTreeRows } from '../behavior/tree.ts';
import type { TreeVisibleRow } from '../behavior/tree.ts';
import { dataSource, dataSpan, dataValueSpans, selectionMarkerSpans } from './data-visual.ts';
import { rowWindow, scrollStateFromUnknown } from './data-window.ts';
import { stringify } from './render-node-props.ts';
import { resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import { windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { TreeDisclosureAction, TreeNode } from '../components/types.ts';
import type { Rect } from './layout.ts';
import { clipRenderSpans } from './render-primitives.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { RoutedPointerEvent } from './pointer-types.ts';
import type { ScrollState } from './scroll.ts';
import type { HitTarget } from './render-node-renderer.ts';

interface TreeWindow {
  readonly rows: readonly TreeVisibleRow[];
  readonly start: number;
  readonly end: number;
}

export function treeBlock(widget: RenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = treeVisibleRows(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  if (rows.length === 0 && bounds.height > 0) {
    return {
      lines: [{
        spans: [dataSpan(emptyText(widget), renderNodeStyle(widget, 'placeholder'), treeSource(widget, 'empty'))]
      }]
    };
  }
  return {
    lines: window.rows.map((row) => treeLine(widget, row, selected, bounds.width, theme))
  };
}

export function treeAccessibleBase(widget: RenderNode, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const rows = treeVisibleRows(widget);
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

export function treeAccessibleChildren(widget: RenderNode, bounds: Rect): readonly AccessibleNode[] {
  const rows = treeVisibleRows(widget);
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

export function treeHitTargets<TMessage>(widget: RenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toMessageProp(widget);
  const toDisclosureMessage = toDisclosureMessageProp(widget);
  if (toMessage === undefined && toDisclosureMessage === undefined) return [];
  const rows = treeVisibleRows(widget);
  const selected = selectedTreeId(widget);
  const window = treeWindow(widget, rows, bounds.height, selected);
  return window.rows.flatMap((row, index): HitTarget<TMessage>[] => {
    if (row.lazyPlaceholder === true || row.node.disabled === true) return [];
    const targets: HitTarget<TMessage>[] = [];
    const disclosureMessage = toDisclosureMessage;
    const disclosureBounds = treeNodeCanDisclose(row.node) ? treeDisclosureBounds(bounds, index, row) : undefined;
    const hasDisclosureTarget = disclosureMessage !== undefined && disclosureBounds !== undefined;
    if (hasDisclosureTarget) {
      const messageForDisclosure = disclosureMessage;
      targets.push({
        id: `${widget.id ?? 'tree'}:${row.node.id}:disclosure`,
        bounds: disclosureBounds,
        message: (event) => {
          const action = treeDisclosureAction(row.node, 'toggle');
          return action === undefined ? undefined : messageForDisclosure(row.node, action, event);
        },
        cursor: 'pointer'
      });
    }
    if (toMessage !== undefined) {
      const rowBounds = treeRowBodyBounds(bounds, index, row, hasDisclosureTarget);
      if (rowBounds.width > 0) {
        targets.push({
          id: `${widget.id ?? 'tree'}:${row.node.id}:body`,
          bounds: rowBounds,
          message: () => toMessage(row.node),
          cursor: 'pointer'
        });
      }
    }
    return targets;
  });
}

function treeLine(widget: RenderNode, row: TreeVisibleRow, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
  const isSelected = row.node.id === selected;
  const branch = branchSymbol(row.node, row.lazyPlaceholder === true, theme);
  const icon = row.node.icon === undefined ? '' : `${row.node.icon} `;
  const label = row.node.label;
  const labelStyle = treeLabelStyle(widget, row, isSelected);
  const branchStyle = treeBranchStyle(widget, row, isSelected);
  const iconStyle = treeIconStyle(widget, row, isSelected);
  const markerStyle = treeMarkerStyle(widget, row, isSelected);
  const query = filterQuery(widget);
  const nodeSourceId = `${widget.id ?? 'tree'}:${row.node.id}`;
  const spans: RenderSpan[] = [
    ...selectionMarkerSpans(
      widget,
      isSelected,
      theme,
      markerStyle,
      treeSource(widget, `node.${row.node.id}.marker`, {
        itemId: nodeSourceId,
        partKind: 'selection-marker',
        role: 'decoration',
        ...treeSourceState(treeRowState(row, isSelected))
      })
    ),
    ...(row.depth === 0 ? [] : [dataSpan('  '.repeat(row.depth), branchStyle, treeSource(widget, `node.${row.node.id}.indent`, {
      itemId: nodeSourceId,
      partKind: 'indent',
      role: 'decoration',
      ...treeSourceState(treeRowState(row, isSelected))
    }))]),
    dataSpan(branch, branchStyle, treeSource(widget, `node.${row.node.id}.disclosure`, {
      itemId: nodeSourceId,
      partKind: 'disclosure',
      role: 'decoration',
      ...treeSourceState(treeDisclosureState(row, isSelected))
    })),
    dataSpan(' ', branchStyle, treeSource(widget, `node.${row.node.id}.disclosure.gap`, {
      itemId: nodeSourceId,
      partKind: 'gap',
      role: 'decoration',
      ...treeSourceState(treeDisclosureState(row, isSelected))
    })),
    ...(icon.length === 0 ? [] : [dataSpan(icon, iconStyle, treeSource(widget, `node.${row.node.id}.icon`, {
      itemId: nodeSourceId,
      partKind: 'icon',
      role: 'decoration',
      ...treeSourceState(treeRowState(row, isSelected))
    }))]),
    ...dataValueSpans(label, query, labelStyle, {
      source: treeSource(widget, `node.${row.node.id}.label`, {
        itemId: nodeSourceId,
        partKind: 'label',
        ...treeSourceState(treeRowState(row, isSelected))
      }),
      matchSource: treeSource(widget, `node.${row.node.id}.match`, {
        itemId: nodeSourceId,
        partKind: 'match',
        state: 'match'
      })
    })
  ];
  return {
    spans: clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…' })
  };
}

function branchSymbol(node: TreeNode, lazyPlaceholder: boolean, theme: TerminalTheme): string {
  if (lazyPlaceholder) return theme.tokens.symbols.unselected;
  if ((node.children === undefined || node.children.length === 0) && node.lazy !== true) return theme.tokens.symbols.unselected;
  return node.expanded === true ? theme.tokens.symbols.treeExpanded : theme.tokens.symbols.treeCollapsed;
}

function treeLabelStyle(widget: RenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    ...(state === undefined ? {} : { state })
  });
}

function treeBranchStyle(widget: RenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'border',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIconStyle(widget: RenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'label',
    ...(state === undefined ? {} : { state })
  });
}

function treeMarkerStyle(widget: RenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return state === undefined ? undefined : renderNodeStyle(widget, 'value', state);
}

function treeVisualState(row: TreeVisibleRow, selected: boolean): RenderNodeVisualState | undefined {
  if (row.node.disabled === true) return 'disabled';
  return selected ? 'selected' : undefined;
}

function treeRowState(row: TreeVisibleRow, selected: boolean): string | undefined {
  if (row.lazyPlaceholder === true) return 'placeholder';
  return treeVisualState(row, selected);
}

function treeDisclosureState(row: TreeVisibleRow, selected: boolean): string | undefined {
  if (!treeNodeCanDisclose(row.node) && row.lazyPlaceholder !== true) return 'leaf';
  return treeRowState(row, selected);
}

function treeSourceState(state: string | undefined): { readonly state?: string } {
  return state === undefined ? {} : { state };
}

export function treeVisibleRows(widget: RenderNode): readonly TreeVisibleRow[] {
  const roots = treeNodes(widget.props['nodes']);
  return visibleTreeRows(roots, { filterQuery: filterQuery(widget) });
}

function treeWindow(widget: RenderNode, rows: readonly TreeVisibleRow[], height: number, selected: string | undefined): TreeWindow {
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

function selectedTreeId(widget: RenderNode): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedTreeIndex(rows: readonly TreeVisibleRow[], selected: string | undefined): number | undefined {
  if (selected === undefined) return undefined;
  const index = rows.findIndex((row) => row.node.id === selected);
  return index === -1 ? undefined : index;
}

function treeDisclosureBounds(bounds: Rect, rowIndex: number, row: TreeVisibleRow): Rect | undefined {
  const offset = treeDisclosureColumnOffset(row);
  if (offset >= bounds.width) return undefined;
  return {
    row: bounds.row + rowIndex,
    column: bounds.column + offset,
    width: Math.min(2, bounds.width - offset),
    height: 1
  };
}

function treeRowBodyBounds(bounds: Rect, rowIndex: number, row: TreeVisibleRow, hasDisclosureTarget: boolean): Rect {
  const offset = hasDisclosureTarget ? Math.min(bounds.width, treeDisclosureColumnOffset(row) + 2) : 0;
  return {
    row: bounds.row + rowIndex,
    column: bounds.column + offset,
    width: Math.max(0, bounds.width - offset),
    height: 1
  };
}

function treeDisclosureColumnOffset(row: TreeVisibleRow): number {
  return 2 + row.depth * 2;
}

function scrollInput(widget: RenderNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props['scroll']);
  return scroll === undefined ? {} : { scroll };
}

function toMessageProp<TMessage>(widget: RenderNode<TMessage>): ((node: TreeNode) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isTreeMessageFactory(toMessage)) return undefined;
  return (node) => toMessage(node) as TMessage;
}

function toDisclosureMessageProp<TMessage>(
  widget: RenderNode<TMessage>
): ((node: TreeNode, action: TreeDisclosureAction, event: RoutedPointerEvent) => TMessage) | undefined {
  const toDisclosureMessage = widget.props['toDisclosureMessage'];
  if (!isTreeDisclosureMessageFactory(toDisclosureMessage)) return undefined;
  return (node, action, event) => toDisclosureMessage(node, action, event) as TMessage;
}

function emptyText(widget: RenderNode): string {
  const text = clean(stringify(widget.props['emptyText']));
  return text.length === 0 ? 'No nodes' : text;
}

function filterQuery(widget: RenderNode): string {
  return clean(stringify(widget.props['filterQuery'])).trim();
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

function isTreeDisclosureMessageFactory(
  value: unknown
): value is (node: TreeNode, action: TreeDisclosureAction, event: RoutedPointerEvent) => unknown {
  return typeof value === 'function';
}

function treeSource(
  widget: RenderNode,
  label: string,
  options: {
    readonly itemId?: string;
    readonly partKind?: string;
    readonly role?: FrameCellSource['role'];
    readonly state?: string;
  } = {}
): FrameCellSource {
  return dataSource(widget, label, {
    ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    role: options.role,
    ...(options.partKind === undefined ? {} : { partKind: options.partKind }),
    ...(options.state === undefined ? {} : { state: options.state })
  });
}
