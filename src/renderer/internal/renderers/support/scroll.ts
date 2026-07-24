import type { TextWidthProfile } from '../../../../text/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type {
  RenderNodeKind,
  RenderNodeOfKind,
  RenderNodesOfKind
} from '../../../model/index.ts';
import { dataWindow } from '../../../../behavior/data-window.ts';
import { createScrollState, normalizeScrollState } from '../../../../behavior/scroll.ts';
import { renderScrollbars, scrollbarLayout } from '../../scrollbar.ts';
import { logViewerWindow } from '../../log-viewer.ts';
import { isRecord } from './common.ts';
import { viewportVisualState } from './viewport.ts';
import type { RenderTarget } from '../../../model/render-target.ts';
import type { LayoutNode, Rect } from '../../../model/layout.ts';
import type { RoutedPointerEvent } from '../../../../input/pointer.ts';
import { ignoreMessage } from '../../../../interaction/message.ts';
import type { MessageResolution } from '../../../../interaction/message.ts';
import type {
  ScrollAction,
  ScrollState,
  ScrollEvent,
  ScrollEventSource,
  ScrollEventTarget
} from '../../../../interaction/scroll.ts';
import type {
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarTrack,
  ScrollbarVisualState
} from '../../scrollbar.ts';
import type { HitTarget } from '../../../model/renderer.ts';
import { collectionRecordById } from '../../../../ui-model/collection.ts';
import { textAreaRenderModel } from '../../text-area/render-model.ts';

const WHEEL_SCROLL_LINES = 3;
const WHEEL_SCROLL_COLUMNS = 3;

type ScrollableRenderNodeKind =
  | 'list'
  | 'menu'
  | 'searchPicker'
  | 'logViewer'
  | 'table'
  | 'textArea'
  | 'tree'
  | 'viewport';
type ScrollableNode<TMessage = unknown> = RenderNodesOfKind<TMessage, ScrollableRenderNodeKind>;
type StateBackedScrollableNode = RenderNodesOfKind<
  unknown,
  Exclude<ScrollableRenderNodeKind, 'menu' | 'logViewer' | 'viewport'>
>;
type TableNode = RenderNodeOfKind<unknown, 'table'>;
type TreeNode = RenderNodeOfKind<unknown, 'tree'>;
type ViewportNode = RenderNodeOfKind<unknown, 'viewport'>;
type LogViewerNode = RenderNodeOfKind<unknown, 'logViewer'>;
type SearchPickerNode = RenderNodeOfKind<unknown, 'searchPicker'>;
type MenuNode = RenderNodeOfKind<unknown, 'menu'>;
type TextAreaNode = RenderNodeOfKind<unknown, 'textArea'>;

interface NormalizedScrollWheelPolicy {
  readonly unit: 'line' | 'page';
  readonly rows: number;
  readonly columns: number;
}

interface RenderNodeScrollbarPlan {
  readonly contentBounds: Rect;
  readonly layout?: ScrollbarLayout;
  readonly state: ScrollState;
}

type RenderNodeScrollbarStateFactory = (bounds: Rect) => ScrollState;

export function scrollbarsForRenderNode(
  renderNode: ScrollableNode,
  bounds: Rect,
  stateForBounds: RenderNodeScrollbarStateFactory,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): RenderNodeScrollbarPlan {
  const initialState = stateForBounds(bounds);
  const options = scrollbarOptionsProp(renderNode, fallbackAxis);
  if (options === undefined) {
    return {
      contentBounds: bounds,
      state: initialState
    };
  }
  const layout = reconciledScrollbarLayout(bounds, initialState, options, stateForBounds);
  return {
    contentBounds: layout.contentBounds,
    layout,
    state: stateForBounds(layout.contentBounds)
  };
}

export function drawScrollbars(
  buffer: RenderTarget,
  renderNode: { readonly id?: string; readonly kind: RenderNodeKind },
  plan: RenderNodeScrollbarPlan,
  theme: TerminalTheme
): void {
  if (plan.layout !== undefined) {
    renderScrollbars(buffer, plan.layout, theme, {
      ...(renderNode.id === undefined ? {} : { elementId: renderNode.id }),
      elementKind: renderNode.kind
    });
  }
}

export function scrollbarHitTargetsForRenderNode<TMessage>(
  renderNode: ScrollableNode<TMessage>,
  plan: RenderNodeScrollbarPlan,
  state: ScrollState
): readonly HitTarget<TMessage>[] {
  const factory = scrollMessageFactory(renderNode);
  if (factory === undefined) return [];
  const id = renderNode.id ?? renderNode.kind;
  const eventState = scrollStateForContentBounds(state, plan.contentBounds);
  const wheel = scrollWheelPolicyProp(renderNode);
  return [
    ...(plan.contentBounds.width > 0 && plan.contentBounds.height > 0
      ? [scrollContentHitTarget(id, plan.contentBounds, eventState, wheel, factory)]
      : []),
    ...(plan.layout?.verticalTrack === undefined
      ? []
      : scrollbarTrackHitTargets(id, 'vertical', plan.layout.verticalTrack, eventState, wheel, factory)),
    ...(plan.layout?.horizontalTrack === undefined
      ? []
      : scrollbarTrackHitTargets(id, 'horizontal', plan.layout.horizontalTrack, eventState, wheel, factory))
  ];
}

function scrollStateForContentBounds(state: ScrollState, bounds: Rect): ScrollState {
  return normalizeScrollState({
    ...state,
    viewportRows: bounds.height,
    viewportColumns: state.viewportColumns
  });
}

function reconciledScrollbarLayout(
  bounds: Rect,
  initialState: ScrollbarState,
  options: ScrollbarOptions,
  stateForBounds: RenderNodeScrollbarStateFactory
): ScrollbarLayout {
  let layout = scrollbarLayout(bounds, initialState, options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = scrollbarLayout(bounds, stateForBounds(layout.contentBounds), options);
    if (rectsEqual(next.contentBounds, layout.contentBounds)) return next;
    layout = next;
  }
  return layout;
}

function rectsEqual(left: Rect, right: Rect): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.width === right.width
    && left.height === right.height;
}

function scrollMessageFactory<TMessage>(
  renderNode: ScrollableNode<TMessage>
): ((event: ScrollEvent) => MessageResolution<TMessage>) | undefined {
  if (renderNode.kind === 'textArea') {
    const raw = renderNode.props.toActionMessage;
    return raw === undefined ? undefined : (event) => raw({ kind: 'scroll', event });
  }
  if (renderNode.kind === 'logViewer') {
    const raw = renderNode.props.toActionMessage;
    return raw === undefined ? undefined : (event) => raw({ kind: 'scroll', event });
  }
  const raw = renderNode.props.toScrollMessage;
  return typeof raw === 'function'
    ? (event) => (raw)(event)
    : undefined;
}

function scrollContentHitTarget<TMessage>(
  id: string,
  bounds: Rect,
  state: ScrollState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => MessageResolution<TMessage>
): HitTarget<TMessage> {
  return {
    id: `${id}:scroll:content`,
    bounds,
    accepts: ['scroll'],
    message: (event) => {
      const action = scrollActionForWheel(event, wheel);
      return action === undefined ? ignoreMessage() : factory(scrollEvent(action, state, event, 'content'));
    }
  };
}

function scrollbarTrackHitTargets<TMessage>(
  id: string,
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => MessageResolution<TMessage>
): readonly HitTarget<TMessage>[] {
  const trackTarget: HitTarget<TMessage> = {
    id: `${id}:scrollbar:${axis}:track`,
    bounds: track.bounds,
    accepts: ['scroll', 'pointerDown', 'dragStart', 'drag'],
    cursor: 'pointer',
    message: (event) => {
      const action = event.kind === 'scroll'
        ? scrollActionForWheel(event, wheel)
        : scrollActionForTrack(axis, track, state, event);
      return action === undefined ? ignoreMessage() : factory(scrollEvent(
        action,
        state,
        event,
        axis === 'vertical' ? 'verticalScrollbarTrack' : 'horizontalScrollbarTrack'
      ));
    }
  };
  const thumbBounds = scrollbarThumbBounds(track);
  return thumbBounds === undefined
    ? [trackTarget]
    : [
        trackTarget,
        {
          id: `${id}:scrollbar:${axis}:thumb`,
          bounds: thumbBounds,
          accepts: ['pointerDown', 'dragStart', 'drag'],
          cursor: 'pointer',
          message: (event) => {
            const action = scrollActionForThumb(axis, track, state, event);
            return action === undefined ? ignoreMessage() : factory(scrollEvent(
              action,
              state,
              event,
              axis === 'vertical' ? 'verticalScrollbarThumb' : 'horizontalScrollbarThumb'
            ));
          }
        }
      ];
}

function scrollEvent(
  action: ScrollAction,
  scroll: ScrollState,
  pointer: RoutedPointerEvent,
  target: ScrollEventTarget
): ScrollEvent {
  return {
    action,
    scroll,
    source: scrollEventSource(pointer),
    target,
    pointer
  };
}

function scrollEventSource(event: RoutedPointerEvent): ScrollEventSource {
  switch (event.kind) {
    case 'scroll':
      return 'wheel';
    case 'pointerDown':
    case 'dragStart':
    case 'drag':
      return event.kind;
    default:
      return 'wheel';
  }
}

function scrollActionForWheel(
  event: RoutedPointerEvent,
  policy: NormalizedScrollWheelPolicy
): ScrollAction | undefined {
  if (event.deltaRows === 0 && event.deltaColumns === 0) return undefined;
  const rows = event.deltaRows === 0 ? undefined : event.deltaRows * policy.rows;
  const columns = event.deltaColumns === 0 ? undefined : event.deltaColumns * policy.columns;
  if ((rows ?? 0) === 0 && (columns ?? 0) === 0) return undefined;
  return {
    kind: policy.unit === 'page' ? 'scrollPages' : 'scrollLines',
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  };
}

function scrollActionForTrack(
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  if (axis === 'vertical') {
    const local = event.localRow;
    if (local === undefined) return undefined;
    return {
      kind: 'setOffset',
      rows: offsetForTrack(local - 1, track.bounds.height, state.contentRows, track.bounds.height)
    };
  }
  const local = event.localColumn;
  if (local === undefined) return undefined;
  return {
    kind: 'setOffset',
    columns: offsetForTrack(local - 1, track.bounds.width, state.contentColumns, track.bounds.width)
  };
}

function scrollActionForThumb(
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollState,
  event: RoutedPointerEvent
): ScrollAction | undefined {
  if (axis === 'vertical') {
    const anchor = Math.max(0, (event.pressLocalRow ?? event.localRow ?? 1) - 1);
    return {
      kind: 'setOffset',
      rows: offsetForThumbStart(event.row - track.bounds.row - anchor, track.bounds.height, track.thumb.size, state.contentRows, state.viewportRows)
    };
  }
  const anchor = Math.max(0, (event.pressLocalColumn ?? event.localColumn ?? 1) - 1);
  return {
    kind: 'setOffset',
    columns: offsetForThumbStart(event.column - track.bounds.column - anchor, track.bounds.width, track.thumb.size, state.contentColumns, state.viewportColumns)
  };
}

function offsetForTrack(position: number, trackSize: number, contentSize: number, viewportSize: number): number {
  const maxOffset = Math.max(0, Math.floor(contentSize) - Math.max(0, Math.floor(viewportSize)));
  if (maxOffset === 0) return 0;
  const maxPosition = Math.max(1, Math.max(0, Math.floor(trackSize)) - 1);
  const clamped = Math.max(0, Math.min(maxPosition, Math.floor(position)));
  return Math.round(maxOffset * clamped / maxPosition);
}

function offsetForThumbStart(
  position: number,
  trackSize: number,
  thumbSize: number,
  contentSize: number,
  viewportSize: number
): number {
  const maxOffset = Math.max(0, Math.floor(contentSize) - Math.max(0, Math.floor(viewportSize)));
  if (maxOffset === 0) return 0;
  const maxPosition = Math.max(1, Math.max(0, Math.floor(trackSize)) - Math.max(1, Math.floor(thumbSize)));
  const clamped = Math.max(0, Math.min(maxPosition, Math.floor(position)));
  return Math.round(maxOffset * clamped / maxPosition);
}

function scrollbarThumbBounds(track: ScrollbarTrack): Rect | undefined {
  if (!track.scrollable || track.thumb.size <= 0) return undefined;
  if (track.axis === 'vertical') {
    return {
      row: track.bounds.row + track.thumb.start,
      column: track.bounds.column,
      width: track.bounds.width,
      height: track.thumb.size
    };
  }
  return {
    row: track.bounds.row,
    column: track.bounds.column + track.thumb.start,
    width: track.thumb.size,
    height: track.bounds.height
  };
}

function scrollbarOptionsProp(
  renderNode: ScrollableNode,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): ScrollbarOptions | undefined {
  const raw = renderNode.props.scrollbar;
  if (!isRecord(raw)) return undefined;
  const visible = raw['visible'];
  const axis = raw['axis'];
  const visualState = raw['visualState'];
  return {
    axis: isScrollbarAxis(axis) ? axis : fallbackAxis,
    visible: isScrollbarVisibility(visible) ? visible : 'auto',
    ...(isScrollbarVisualState(visualState) ? { visualState } : {})
  };
}

function scrollWheelPolicyProp(renderNode: ScrollableNode): NormalizedScrollWheelPolicy {
  const raw = renderNode.props.scrollPolicy;
  if (!isRecord(raw)) return defaultWheelPolicy();
  const wheel = raw['wheel'];
  if (!isRecord(wheel)) return defaultWheelPolicy();
  return {
    unit: wheel['unit'] === 'page' ? 'page' : 'line',
    rows: nonNegativeInteger(wheel['rows'], WHEEL_SCROLL_LINES),
    columns: nonNegativeInteger(wheel['columns'], WHEEL_SCROLL_COLUMNS)
  };
}

function defaultWheelPolicy(): NormalizedScrollWheelPolicy {
  return {
    unit: 'line',
    rows: WHEEL_SCROLL_LINES,
    columns: WHEEL_SCROLL_COLUMNS
  };
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function isScrollbarAxis(value: unknown): value is NonNullable<ScrollbarOptions['axis']> {
  return value === 'vertical' || value === 'horizontal' || value === 'both';
}

function isScrollbarVisibility(value: unknown): value is NonNullable<ScrollbarOptions['visible']> {
  return value === 'auto' || value === 'always' || value === 'never';
}

function isScrollbarVisualState(value: unknown): value is ScrollbarVisualState {
  return value === 'idle'
    || value === 'active'
    || value === 'hover'
    || value === 'disabled'
    || value === 'inactive';
}

export function tableScrollbarState(renderNode: TableNode, bounds: Rect): ScrollState {
  const selected = selectedTableRow(renderNode);
  const window = dataWindow({
    totalRows: renderNode.props.collection.totalCount,
    viewportRows: bounds.height,
    selectedIndex: selected
  });
  const configured = normalizedRenderNodeScroll(renderNode, {
    offsetRow: scrollNumberProp(renderNode, 'offsetRow') ?? window.startIndex,
    contentRows: scrollNumberProp(renderNode, 'contentRows') ?? renderNode.props.collection.totalCount,
    contentColumns: scrollNumberProp(renderNode, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return configured;
}

export function treeScrollbarState(renderNode: TreeNode, bounds: Rect): ScrollState {
  const scroll = normalizedRenderNodeScroll(renderNode, {
    contentRows: renderNode.props.view.collection.totalCount,
    contentColumns: scrollNumberProp(renderNode, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function viewportScrollbarState(renderNode: ViewportNode, bounds: Rect): ScrollState {
  const state = viewportVisualState(renderNode, bounds);
  return normalizeScrollState({
    offsetRow: state.offsetRow,
    offsetColumn: state.offsetColumn,
    contentRows: state.contentRows,
    contentColumns: state.contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
    followTail: false
  });
}

export function logViewerScrollbarState(
  renderNode: LogViewerNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): ScrollState {
  const window = logViewerWindow(renderNode, node, widthProfile);
  return createScrollState({
    offsetRow: window.start,
    offsetColumn: 0,
    contentRows: window.totalRows,
    contentColumns: node.bounds.width,
    viewportRows: node.bounds.height,
    viewportColumns: node.bounds.width,
    followTail: window.followTail
  });
}

export function searchPickerScrollbarState(renderNode: SearchPickerNode, bounds: Rect): ScrollState {
  const scroll = normalizedRenderNodeScroll(renderNode, {
    contentRows: scrollNumberProp(renderNode, 'contentRows') ?? renderNode.props.searchPickerIndex.size,
    contentColumns: scrollNumberProp(renderNode, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function menuScrollbarState(renderNode: MenuNode, bounds: Rect): ScrollState {
  const rows = countMenuRows(renderNode.props.items);
  const scroll = createScrollState({
    ...(renderNode.props.presentation.scroll ?? {}),
    contentRows: rows,
    contentColumns: bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function textAreaScrollbarState(
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): ScrollState {
  return textAreaRenderModel(renderNode, bounds, theme, widthProfile).scroll;
}

interface RenderNodeScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
}

function normalizedRenderNodeScroll(renderNode: StateBackedScrollableNode, input: RenderNodeScrollStateInput): ReturnType<typeof normalizeScrollState> {
  const raw: Readonly<Record<string, unknown>> = isRecord(renderNode.props.scroll) ? renderNode.props.scroll : {};
  const selectedIndex = scrollNumberField(raw, 'selectedIndex');
  return normalizeScrollState({
    offsetRow: input.offsetRow ?? scrollNumberField(raw, 'offsetRow') ?? 0,
    offsetColumn: input.offsetColumn ?? scrollNumberField(raw, 'offsetColumn') ?? 0,
    contentRows: input.contentRows,
    contentColumns: input.contentColumns,
    viewportRows: input.viewportRows,
    viewportColumns: input.viewportColumns,
    followTail: raw['followTail'] === true,
    ...(selectedIndex === undefined ? {} : { selectedIndex })
  });
}

function scrollNumberProp(renderNode: StateBackedScrollableNode, key: string): number | undefined {
  const raw = renderNode.props.scroll;
  return isRecord(raw) ? scrollNumberField(raw, key) : undefined;
}

function scrollNumberField(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function countMenuRows(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce<number>((count, item) => {
    if (!isRecord(item)) return count;
    const children = item['expanded'] === true ? countMenuRows(item['children']) : 0;
    return count + 1 + children;
  }, 0);
}

function selectedTableRow(renderNode: TableNode): number {
  const selectedCell = renderNode.props.selectedCell;
  const selectedCellId = isRecord(selectedCell) && typeof selectedCell.rowId === 'string'
    ? selectedCell.rowId
    : undefined;
  const selectedRowId = selectedCellId ?? (typeof renderNode.props.selectedRowId === 'string' ? renderNode.props.selectedRowId : undefined);
  const selected = selectedRowId === undefined
    ? -1
    : collectionRecordById(renderNode.props.collection, selectedRowId)?.itemIndex ?? -1;
  return Math.max(0, selected);
}
