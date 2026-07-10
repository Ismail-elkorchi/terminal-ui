import type { RenderNodeOfKind } from '../render-node/index.ts';
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
import type { TreeDisclosureAction, TreeNode } from '../components/options/content.ts';
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

interface TreeProjection {
  readonly rows: readonly TreeVisibleRow[];
  readonly selected: string | undefined;
  readonly window: TreeWindow;
}

const treeRowsCache = new WeakMap<object, readonly TreeVisibleRow[]>();
const treeProjectionCache = new WeakMap<object, {
  readonly height: number;
  readonly projection: TreeProjection;
}>();

export function treeBlock(widget: TreeRenderNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const { rows, selected, window } = treeProjection(widget, bounds.height);
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

export function treeAccessibleBase(widget: TreeRenderNode, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const { rows, window } = treeProjection(widget, bounds.height);
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

export function treeAccessibleChildren(widget: TreeRenderNode, bounds: Rect): readonly AccessibleNode[] {
  const { rows, selected, window } = treeProjection(widget, bounds.height);
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

export function treeHitTargets<TMessage>(widget: TreeRenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toMessageProp(widget);
  const toDisclosureMessage = toDisclosureMessageProp(widget);
  if (toMessage === undefined && toDisclosureMessage === undefined) return [];
  const { window } = treeProjection(widget, bounds.height);
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

function treeLine(widget: TreeRenderNode, row: TreeVisibleRow, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
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

function treeLabelStyle(widget: TreeRenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'value',
    ...(state === undefined ? {} : { state })
  });
}

function treeBranchStyle(widget: TreeRenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'border',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIconStyle(widget: TreeRenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  const state = treeVisualState(row, selected);
  return resolveRenderNodeStyle(widget, {
    slot: 'label',
    ...(state === undefined ? {} : { state })
  });
}

function treeMarkerStyle(widget: TreeRenderNode, row: TreeVisibleRow, selected: boolean): TerminalStyle | undefined {
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

export function treeVisibleRows(widget: TreeRenderNode): readonly TreeVisibleRow[] {
  const cached = treeRowsCache.get(widget);
  if (cached !== undefined) return cached;
  const rows = visibleTreeRows(widget.props.nodes, { filterQuery: filterQuery(widget) });
  treeRowsCache.set(widget, rows);
  return rows;
}

function treeProjection(widget: TreeRenderNode, height: number): TreeProjection {
  const cached = treeProjectionCache.get(widget);
  if (cached?.height === height) return cached.projection;
  const rows = treeVisibleRows(widget);
  const selected = selectedTreeId(widget);
  const projection = {
    rows,
    selected,
    window: treeWindow(widget, rows, height, selected)
  };
  treeProjectionCache.set(widget, { height, projection });
  return projection;
}

function treeWindow(widget: TreeRenderNode, rows: readonly TreeVisibleRow[], height: number, selected: string | undefined): TreeWindow {
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

function selectedTreeId(widget: TreeRenderNode): string | undefined {
  const selected = widget.props.selected;
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

function scrollInput(widget: TreeRenderNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function toMessageProp<TMessage>(widget: TreeRenderNode<TMessage>): ((node: TreeNode) => TMessage) | undefined {
  return widget.props.toMessage;
}

function toDisclosureMessageProp<TMessage>(
  widget: TreeRenderNode<TMessage>
): ((node: TreeNode, action: TreeDisclosureAction, event: RoutedPointerEvent) => TMessage) | undefined {
  return widget.props.toDisclosureMessage;
}

function emptyText(widget: TreeRenderNode): string {
  const text = clean(stringify(widget.props.emptyText));
  return text.length === 0 ? 'No nodes' : text;
}

function filterQuery(widget: TreeRenderNode): string {
  return clean(stringify(widget.props.filterQuery)).trim();
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function treeSource(
  widget: TreeRenderNode,
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
type TreeRenderNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'tree'>;
