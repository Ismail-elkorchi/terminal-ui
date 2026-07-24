import type { RenderNodeOfKind } from '../model/index.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { treeDisclosureAction, treeNodeCanDisclose } from '../../behavior/tree.ts';
import { treeNodeExpanded } from '../../ui-model/tree.ts';
import { collectionRecordById } from '../../ui-model/collection.ts';
import type { TreeVisibleRow } from '../../ui-model/tree.ts';
import { dataSource, dataSpan, dataValueSpans, mergeDataStyles, selectionMarkerSpans } from './data-visual.ts';
import { isFrameCellInteractionState } from '../../visual/source.ts';
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
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';

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
  renderNode: TreeRenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const { totalRows, selected, window } = treeProjection(renderNode, bounds.height);
  if (totalRows === 0 && bounds.height > 0) {
    return {
      lines: [{
        spans: [dataSpan(emptyText(renderNode), resolveRenderNodeStyle(renderNode, {
          part: 'empty',
          base: themeStyle('text.muted', { dim: true })
        }), treeSource(renderNode, 'empty'))]
      }]
    };
  }
  return {
    lines: window.rows.map((row) => treeLine(renderNode, row, selected, bounds.width, theme, widthProfile, focused))
  };
}

export function treeAccessibleBase(renderNode: TreeRenderNode, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const { totalRows, window } = treeProjection(renderNode, bounds.height);
  return {
    id,
    role: 'tree',
    label: id,
    description: windowDescription('tree rows', window, totalRows),
    window: {
      startIndex: window.start,
      endIndexExclusive: window.end,
      totalCount: totalRows,
      omittedBefore: window.start,
      omittedAfter: Math.max(0, totalRows - window.end)
    },
    ...(focused ? { focused } : {})
  };
}

export function treeAccessibleChildren(renderNode: TreeRenderNode, bounds: Rect): readonly AccessibleNode[] {
  const { totalRows, selected, window } = treeProjection(renderNode, bounds.height);
  return window.rows.map((row, index) => ({
    id: `${renderNode.id ?? 'tree'}:${row.node.id}`,
    role: 'treeitem',
    label: row.node.label,
    ...(row.node.description === undefined ? {} : { description: row.node.description }),
    selected: row.node.id === selected,
    disabled: row.node.disabled === true || row.lazyPlaceholder === true,
    ...(row.node.kind === 'leaf' ? {} : { expanded: treeNodeExpanded(row.node) }),
    position: {
      positionInSet: window.start + index + 1,
      setSize: totalRows,
      level: row.depth + 1
    },
    value: row.path.join('/')
  }));
}

export function treeHitTargets<TMessage>(renderNode: TreeRenderNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toActionMessageProp(renderNode);
  if (toMessage === undefined) return [];
  const { window } = treeProjection(renderNode, bounds.height);
  return window.rows.flatMap((row, index): HitTarget<TMessage>[] => {
    if (row.lazyPlaceholder === true || row.node.disabled === true) return [];
    const targets: HitTarget<TMessage>[] = [];
    const disclosureBounds = treeNodeCanDisclose(row.node) ? treeDisclosureBounds(bounds, index, row) : undefined;
    const hasDisclosureTarget = disclosureBounds !== undefined;
    if (hasDisclosureTarget) {
      targets.push({
        id: treeDisclosureTargetId(renderNode, row.node.id),
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
        id: treeBodyTargetId(renderNode, row.node.id),
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
  renderNode: TreeRenderNode,
  row: TreeVisibleRow,
  selected: string | undefined,
  width: number,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused: boolean
): RenderLine {
  const isSelected = row.node.id === selected;
  const rowState = treeRowVisualState(renderNode, row, isSelected, focused);
  const disclosureState = treeDisclosureVisualState(renderNode, row, isSelected, focused);
  const branch = branchSymbol(row.node, row.lazyPlaceholder === true, theme);
  const icon = row.node.icon === undefined ? '' : `${row.node.icon} `;
  const label = row.node.label;
  const labelStyle = treeLabelStyle(renderNode, row, rowState);
  const disclosureStyle = treeDisclosureStyle(renderNode, row, disclosureState);
  const indentStyle = treeIndentStyle(renderNode, row, rowState);
  const iconStyle = treeIconStyle(renderNode, row, rowState);
  const markerStyle = treeMarkerStyle(renderNode, row, rowState);
  const matchStyle = mergeDataStyles(labelStyle, themeStyle('menu.match', { underline: true }), renderNode.styles?.parts?.['match']);
  const query = renderNode.props.view.query;
  const nodeSourceId = `${renderNode.id ?? 'tree'}:${row.node.id}`;
  const spans: RenderSpan[] = [
    ...selectionMarkerSpans(
      renderNode,
      isSelected,
      theme,
      markerStyle,
      treeSource(renderNode, `node.${row.node.id}.marker`, {
        itemId: nodeSourceId,
        partType: 'selection-marker',
        role: 'decoration',
        ...treeSourceState(treeRowSourceState(row, rowState))
      })
    ),
    ...(row.depth === 0 ? [] : [dataSpan('  '.repeat(row.depth), indentStyle, treeSource(renderNode, `node.${row.node.id}.indent`, {
      itemId: nodeSourceId,
      partType: 'indent',
      role: 'decoration',
      ...treeSourceState(treeRowSourceState(row, rowState))
    }))]),
    dataSpan(branch, disclosureStyle, treeSource(renderNode, `node.${row.node.id}.disclosure`, {
      itemId: nodeSourceId,
      partType: 'disclosure',
      role: 'decoration',
      ...treeSourceState(treeDisclosureSourceState(row, disclosureState))
    })),
    dataSpan(' ', disclosureStyle, treeSource(renderNode, `node.${row.node.id}.disclosure.gap`, {
      itemId: nodeSourceId,
      partType: 'gap',
      role: 'decoration',
      ...treeSourceState(treeDisclosureSourceState(row, disclosureState))
    })),
    ...(icon.length === 0 ? [] : [dataSpan(icon, iconStyle, treeSource(renderNode, `node.${row.node.id}.icon`, {
      itemId: nodeSourceId,
      partType: 'icon',
      role: 'decoration',
      ...treeSourceState(treeRowSourceState(row, rowState))
    }))]),
    ...dataValueSpans(label, query, labelStyle, {
      source: treeSource(renderNode, `node.${row.node.id}.label`, {
        itemId: nodeSourceId,
        partType: 'label',
        ...treeSourceState(treeRowSourceState(row, rowState))
      }),
      matchSource: treeSource(renderNode, `node.${row.node.id}.match`, {
        itemId: nodeSourceId,
        partType: 'match'
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

function treeLabelStyle(renderNode: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(renderNode, 'placeholder');
  return resolveRenderNodeStyle(renderNode, {
    part: 'label',
    base: themeStyle('text.default'),
    ...(state === undefined ? {} : { state })
  });
}

function treeDisclosureStyle(renderNode: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(renderNode, 'placeholder');
  return resolveRenderNodeStyle(renderNode, {
    part: 'disclosure',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIndentStyle(renderNode: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(renderNode, 'placeholder');
  return resolveRenderNodeStyle(renderNode, {
    part: 'indent',
    base: themeStyle('tree.branch'),
    ...(state === undefined ? {} : { state })
  });
}

function treeIconStyle(renderNode: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(renderNode, 'placeholder');
  return resolveRenderNodeStyle(renderNode, {
    part: 'icon',
    ...(state === undefined ? {} : { state })
  });
}

function treeMarkerStyle(renderNode: TreeRenderNode, row: TreeVisibleRow, state: ElementVisualState | undefined): TerminalStyle | undefined {
  if (row.lazyPlaceholder === true) return renderNodeStyle(renderNode, 'placeholder');
  return renderNodeStyle(renderNode, 'marker', state);
}

function treeRowVisualState(
  renderNode: TreeRenderNode,
  row: TreeVisibleRow,
  selected: boolean,
  focused: boolean
): ElementVisualState | undefined {
  if (row.lazyPlaceholder === true) return undefined;
  return interactionVisualState(renderNode, treeBodyTargetId(renderNode, row.node.id), {
    disabled: row.node.disabled === true,
    selected,
    focused: focused && selected
  });
}

function treeDisclosureVisualState(
  renderNode: TreeRenderNode,
  row: TreeVisibleRow,
  selected: boolean,
  focused: boolean
): ElementVisualState | undefined {
  if (!treeNodeCanDisclose(row.node) || row.lazyPlaceholder === true) return undefined;
  return interactionVisualState(renderNode, treeDisclosureTargetId(renderNode, row.node.id), {
    disabled: row.node.disabled === true,
    selected,
    focused: focused && selected
  });
}

function treeRowSourceState(
  row: TreeVisibleRow,
  state: ElementVisualState | undefined
): FrameCellSource['interactionState'] {
  return row.lazyPlaceholder === true || !isFrameCellInteractionState(state) ? undefined : state;
}

function treeDisclosureSourceState(
  row: TreeVisibleRow,
  state: ElementVisualState | undefined
): FrameCellSource['interactionState'] {
  if (row.lazyPlaceholder === true || !treeNodeCanDisclose(row.node)) return undefined;
  return isFrameCellInteractionState(state) ? state : undefined;
}

function treeSourceState(
  state: FrameCellSource['interactionState']
): { readonly state?: NonNullable<FrameCellSource['interactionState']> } {
  return state === undefined ? {} : { state };
}

function treeProjection(renderNode: TreeRenderNode, height: number): TreeProjection {
  const cached = treeProjectionCache.get(renderNode);
  if (cached?.height === height) return cached.projection;
  const selected = selectedTreeId(renderNode);
  const projection = {
    totalRows: renderNode.props.view.collection.totalCount,
    selected,
    window: treeWindow(renderNode, height, selected)
  };
  treeProjectionCache.set(renderNode, { height, projection });
  return projection;
}

function treeWindow(renderNode: TreeRenderNode, height: number, selected: string | undefined): TreeWindow {
  const selectedIndex = selectedTreeIndex(renderNode.props.view.collection, selected) ?? 0;
  const window = projectedRowWindow(renderNode.props.view.collection, {
    viewportRows: height,
    selectedIndex,
    ...scrollInput(renderNode)
  });
  return {
    rows: window.rows.map((record) => record.row),
    start: window.startIndex,
    end: window.endIndexExclusive
  };
}

function selectedTreeId(renderNode: TreeRenderNode): string | undefined {
  const selected = renderNode.props.selected;
  return typeof selected === 'string' ? clean(selected) : undefined;
}

function selectedTreeIndex(
  collection: TreeRenderNode['props']['view']['collection'],
  selected: string | undefined
): number | undefined {
  if (selected === undefined) return undefined;
  return collectionRecordById(collection, selected)?.itemIndex;
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

function scrollInput(renderNode: TreeRenderNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(renderNode.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function toActionMessageProp<TMessage>(
  renderNode: TreeRenderNode<TMessage>
): ((action: TreeControlAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

function emptyText(renderNode: TreeRenderNode): string {
  const text = clean(stringify(renderNode.props.emptyText));
  return text.length === 0 ? 'No nodes' : text;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function treeSource(
  renderNode: TreeRenderNode,
  label: string,
  options: {
    readonly itemId?: string;
    readonly partType?: string;
    readonly role?: FrameCellSource['cellRole'];
    readonly state?: FrameCellSource['interactionState'];
  } = {}
): FrameCellSource {
  return dataSource(renderNode, label, {
    ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    role: options.role,
    ...(options.partType === undefined ? {} : { partType: options.partType }),
    ...(options.state === undefined ? {} : { state: options.state })
  });
}

function treeBodyTargetId(renderNode: TreeRenderNode, nodeId: string): string {
  return renderNodeTargetId(renderNode, nodeId, 'body');
}

function treeDisclosureTargetId(renderNode: TreeRenderNode, nodeId: string): string {
  return renderNodeTargetId(renderNode, nodeId, 'disclosure');
}
type TreeRenderNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'tree'>;
