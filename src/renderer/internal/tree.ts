import type { RenderNodeOfKind } from '../model/index.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { treeDisclosureAction, treeNodeCanDisclose } from '../../behavior/tree.ts';
import { treeNodeExpanded } from '../../ui-model/tree.ts';
import { collectionRecordById } from '../../ui-model/collection.ts';
import type { TreeVisibleRow } from '../../ui-model/tree.ts';
import { dataSource, dataSpan, dataValueSpans, mergeDataStyles, selectionMarkerSpans } from './data-visual.ts';
import { projectedRowWindow, scrollStateFromUnknown } from '../../behavior/data-window.ts';
import { stringify } from './render-node-props.ts';
import { resolveRenderNodeStyle, themeStyle, renderNodeStyle } from './render-node-style.ts';
import { windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { TreeControlAction, TreeNode } from '../../ui-model/tree.ts';
import type { Rect } from '../model/layout.ts';
import { clipRenderSpans } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { HitTarget } from '../model/renderer.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-presentation.ts';

interface TreeWindow {
  readonly rows: readonly TreeVisibleRow[];
  readonly start: number;
  readonly end: number;
}

interface TreeProjection {
  readonly totalRows: number;
  readonly selected: string | undefined;
  readonly window: TreeWindow;
}

const treeProjectionCache = new WeakMap<object, {
  readonly height: number;
  readonly projection: TreeProjection;
}>();

export function treeBlock(
  widget: TreeRenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const { totalRows, selected, window } = treeProjection(widget, bounds.height);
  if (totalRows === 0 && bounds.height > 0) {
    return {
      lines: [{
        spans: [dataSpan(emptyText(widget), resolveRenderNodeStyle(widget, {
          part: 'empty',
          base: themeStyle('text.muted', { dim: true })
        }), treeSource(widget, 'empty'))]
      }]
    };
  }
  return {
    lines: window.rows.map((row) => treeLine(widget, row, selected, bounds.width, theme, widthProfile, focused))
  };
}

export function treeAccessibleBase(widget: TreeRenderNode, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const { totalRows, window } = treeProjection(widget, bounds.height);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('tree rows', window, totalRows),
    window: {
      start: window.start,
      end: window.end,
      total: totalRows,
      omittedBefore: window.start,
      omittedAfter: Math.max(0, totalRows - window.end)
    },
    ...(focused ? { focused } : {})
  };
}

export function treeAccessibleChildren(widget: TreeRenderNode, bounds: Rect): readonly AccessibleNode[] {
  const { totalRows, selected, window } = treeProjection(widget, bounds.height);
  return window.rows.map((row, index) => ({
    id: `${widget.id ?? 'tree'}:${row.node.id}`,
    role: 'option',
    label: row.node.label,
    ...(row.node.description === undefined ? {} : { description: row.node.description }),
    selected: row.node.id === selected,
    disabled: row.node.disabled === true || row.lazyPlaceholder === true,
    ...(row.node.kind === 'leaf' ? {} : { expanded: treeNodeExpanded(row.node) }),
    position: {
      index: window.start + index,
      count: totalRows,
      level: row.depth + 1
    },
    value: row.path.join('/')
  }));
}

export function treeHitTargets<TMessage>(widget: TreeRenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toActionMessageProp(widget);
  if (toMessage === undefined) return [];
  const { window } = treeProjection(widget, bounds.height);
  return window.rows.flatMap((row, index): HitTarget<TMessage>[] => {
    if (row.lazyPlaceholder === true || row.node.disabled === true) return [];
    const targets: HitTarget<TMessage>[] = [];
    const disclosureBounds = treeNodeCanDisclose(row.node) ? treeDisclosureBounds(bounds, index, row) : undefined;
    const hasDisclosureTarget = disclosureBounds !== undefined;
    if (hasDisclosureTarget) {
      targets.push({
        id: treeDisclosureTargetId(widget, row.node.id),
        bounds: disclosureBounds,
        message: () => {
          const action = treeDisclosureAction(row.node, 'toggle');
          return action === undefined ? ignoreMessage() : toMessage(action);
        },
        cursor: 'pointer'
      });
    }
    const rowBounds = treeRowBodyBounds(bounds, index, row, hasDisclosureTarget);
    if (rowBounds.width > 0) {
      targets.push({
        id: treeBodyTargetId(widget, row.node.id),
        bounds: rowBounds,
        message: (event) => toMessage(event.clickCount === 2
          ? { kind: 'activate', id: row.node.id }
          : { kind: 'select', id: row.node.id }),
        cursor: 'pointer'
      });
    }
    return targets;
  });
}

function treeLine(
  widget: TreeRenderNode,
  row: TreeVisibleRow,
  selected: string | undefined,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused: boolean
): RenderLine {
  const isSelected = row.node.id === selected;
  const rowState = treeRowVisualState(widget, row, isSelected, focused);
  const disclosureState = treeDisclosureVisualState(widget, row, isSelected, focused);
  const branch = branchSymbol(row.node, row.lazyPlaceholder === true, theme);
  const icon = row.node.icon === undefined ? '' : `${row.node.icon} `;
  const label = row.node.label;
  const labelStyle = treeLabelStyle(widget, row, rowState);
  const disclosureStyle = treeDisclosureStyle(widget, row, disclosureState);
  const indentStyle = treeIndentStyle(widget, row, rowState);
  const iconStyle = treeIconStyle(widget, row, rowState);
  const markerStyle = treeMarkerStyle(widget, row, rowState);
  const matchStyle = mergeDataStyles(labelStyle, themeStyle('menu.match', { underline: true }), widget.styles?.parts?.['match']);
  const query = widget.props.view.query;
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
        ...treeSourceState(treeRowSourceState(row, rowState))
      })
    ),
    ...(row.depth === 0 ? [] : [dataSpan('  '.repeat(row.depth), indentStyle, treeSource(widget, `node.${row.node.id}.indent`, {
      itemId: nodeSourceId,
      partKind: 'indent',
      role: 'decoration',
      ...treeSourceState(treeRowSourceState(row, rowState))
    }))]),
    dataSpan(branch, disclosureStyle, treeSource(widget, `node.${row.node.id}.disclosure`, {
      itemId: nodeSourceId,
      partKind: 'disclosure',
      role: 'decoration',
      ...treeSourceState(treeDisclosureSourceState(row, disclosureState))
    })),
    dataSpan(' ', disclosureStyle, treeSource(widget, `node.${row.node.id}.disclosure.gap`, {
      itemId: nodeSourceId,
      partKind: 'gap',
      role: 'decoration',
      ...treeSourceState(treeDisclosureSourceState(row, disclosureState))
    })),
    ...(icon.length === 0 ? [] : [dataSpan(icon, iconStyle, treeSource(widget, `node.${row.node.id}.icon`, {
      itemId: nodeSourceId,
      partKind: 'icon',
      role: 'decoration',
      ...treeSourceState(treeRowSourceState(row, rowState))
    }))]),
    ...dataValueSpans(label, query, labelStyle, {
      source: treeSource(widget, `node.${row.node.id}.label`, {
        itemId: nodeSourceId,
        partKind: 'label',
        ...treeSourceState(treeRowSourceState(row, rowState))
      }),
      matchSource: treeSource(widget, `node.${row.node.id}.match`, {
        itemId: nodeSourceId,
        partKind: 'match',
        state: 'match'
      }),
      ...(matchStyle === undefined ? {} : { matchStyle })
    })
  ];
  return {
    spans: clipRenderSpans(spans, Math.max(0, width), { ellipsis: '…', widthProfile })
  };
}

function branchSymbol(node: TreeNode, lazyPlaceholder: boolean, theme: TerminalTheme): string {
  if (lazyPlaceholder) return theme.tokens.symbols.unselected;
  if (node.kind === 'leaf') return theme.tokens.symbols.unselected;
  return treeNodeExpanded(node) ? theme.tokens.symbols.treeExpanded : theme.tokens.symbols.treeCollapsed;
}

function treeLabelStyle(widget: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  return resolveRenderNodeStyle(widget, {
    part: 'label',
    base: themeStyle('text.default'),
    ...(state === undefined ? {} : { state })
  });
}

function treeDisclosureStyle(widget: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  return resolveRenderNodeStyle(widget, {
    part: 'disclosure',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIndentStyle(widget: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  return resolveRenderNodeStyle(widget, {
    part: 'indent',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIconStyle(widget: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  return resolveRenderNodeStyle(widget, {
    part: 'icon',
    ...(state === undefined ? {} : { state })
  });
}

function treeMarkerStyle(widget: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(widget, 'placeholder');
  return renderNodeStyle(widget, 'marker', state);
}

function treeRowVisualState(
  widget: TreeRenderNode,
  row: TreeVisibleRow,
  selected: boolean,
  focused: boolean
): ElementVisualState | undefined {
  if (row.lazyPlaceholder === true) return undefined;
  return interactionVisualState(widget, treeBodyTargetId(widget, row.node.id), {
    disabled: row.node.disabled === true,
    selected,
    focused: focused && selected
  });
}

function treeDisclosureVisualState(
  widget: TreeRenderNode,
  row: TreeVisibleRow,
  selected: boolean,
  focused: boolean
): ElementVisualState | undefined {
  if (!treeNodeCanDisclose(row.node) || row.lazyPlaceholder === true) return undefined;
  return interactionVisualState(widget, treeDisclosureTargetId(widget, row.node.id), {
    disabled: row.node.disabled === true,
    selected,
    focused: focused && selected
  });
}

function treeRowSourceState(row: TreeVisibleRow, state: ElementVisualState | undefined): string | undefined {
  return row.lazyPlaceholder === true ? 'placeholder' : state;
}

function treeDisclosureSourceState(row: TreeVisibleRow, state: ElementVisualState | undefined): string | undefined {
  if (row.lazyPlaceholder === true) return 'placeholder';
  return treeNodeCanDisclose(row.node) ? state : 'leaf';
}

function treeSourceState(state: string | undefined): { readonly state?: string } {
  return state === undefined ? {} : { state };
}

function treeProjection(widget: TreeRenderNode, height: number): TreeProjection {
  const cached = treeProjectionCache.get(widget);
  if (cached?.height === height) return cached.projection;
  const selected = selectedTreeId(widget);
  const projection = {
    totalRows: widget.props.view.collection.total,
    selected,
    window: treeWindow(widget, height, selected)
  };
  treeProjectionCache.set(widget, { height, projection });
  return projection;
}

function treeWindow(widget: TreeRenderNode, height: number, selected: string | undefined): TreeWindow {
  const selectedIndex = selectedTreeIndex(widget.props.view.collection, selected) ?? 0;
  const window = projectedRowWindow(widget.props.view.collection, {
    viewportRows: height,
    selectedIndex,
    ...scrollInput(widget)
  });
  return {
    rows: window.rows.map((record) => record.row),
    start: window.start,
    end: window.end
  };
}

function selectedTreeId(widget: TreeRenderNode): string | undefined {
  const selected = widget.props.selected;
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedTreeIndex(
  collection: TreeRenderNode['props']['view']['collection'],
  selected: string | undefined
): number | undefined {
  if (selected === undefined) return undefined;
  return collectionRecordById(collection, selected)?.index;
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

function toActionMessageProp<TMessage>(
  widget: TreeRenderNode<TMessage>
): ((action: TreeControlAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function emptyText(widget: TreeRenderNode): string {
  const text = clean(stringify(widget.props.emptyText));
  return text.length === 0 ? 'No nodes' : text;
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

function treeBodyTargetId(widget: TreeRenderNode, nodeId: string): string {
  return renderNodeTargetId(widget, nodeId, 'body');
}

function treeDisclosureTargetId(widget: TreeRenderNode, nodeId: string): string {
  return renderNodeTargetId(widget, nodeId, 'disclosure');
}
type TreeRenderNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'tree'>;
