import { measureTextCells, sanitizeTerminalText } from '../../../text/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { RenderNode } from '../../../render-node/index.ts';
import { dataWindow } from '../../data-window.ts';
import { createScrollState, normalizeScrollState } from '../../scroll.ts';
import { renderScrollbars, scrollbarLayout } from '../../scrollbar.ts';
import { scrollbackWindow } from '../../scrollback.ts';
import { treeVisibleRows } from '../../tree.ts';
import { numberProp, stringify } from '../../render-node-props.ts';
import { isRecord } from './common.ts';
import { viewportVisualState } from './viewport.ts';
import type { FrameBuffer } from '../../frame.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { RoutedPointerEvent } from '../../pointer-types.ts';
import type {
  ScrollAction,
  ScrollState,
  ScrollEvent,
  ScrollEventSource,
  ScrollEventTarget
} from '../../scroll.ts';
import type {
  ScrollbarLayout,
  ScrollbarOptions,
  ScrollbarState,
  ScrollbarTrack,
  ScrollbarVisualState
} from '../../scrollbar.ts';
import type { HitTarget } from '../../render-node-renderer.ts';

const WHEEL_SCROLL_LINES = 3;
const WHEEL_SCROLL_COLUMNS = 3;

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
  widget: RenderNode,
  bounds: Rect,
  stateForBounds: RenderNodeScrollbarStateFactory,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): RenderNodeScrollbarPlan {
  const initialState = stateForBounds(bounds);
  const options = scrollbarOptionsProp(widget, fallbackAxis);
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
  buffer: FrameBuffer,
  widget: Pick<RenderNode, 'id' | 'kind'>,
  plan: RenderNodeScrollbarPlan,
  theme: TerminalTheme
): void {
  if (plan.layout !== undefined) {
    renderScrollbars(buffer, plan.layout, theme, {
      ...(widget.id === undefined ? {} : { ownerId: widget.id }),
      ownerKind: widget.kind
    });
  }
}

export function scrollbarHitTargetsForRenderNode<TMessage>(
  widget: RenderNode<TMessage>,
  plan: RenderNodeScrollbarPlan,
  state: ScrollState
): readonly HitTarget<TMessage>[] {
  const factory = scrollMessageFactory(widget);
  if (factory === undefined) return [];
  const id = widget.id ?? widget.kind;
  const eventState = scrollStateForContentBounds(state, plan.contentBounds);
  const wheel = scrollWheelPolicyProp(widget);
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
  widget: RenderNode<TMessage>
): ((event: ScrollEvent) => TMessage) | undefined {
  const raw = widget.props['toScrollMessage'];
  return typeof raw === 'function'
    ? (event) => (raw as (event: ScrollEvent) => TMessage)(event)
    : undefined;
}

function scrollContentHitTarget<TMessage>(
  id: string,
  bounds: Rect,
  state: ScrollState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => TMessage
): HitTarget<TMessage> {
  return {
    id: `${id}:scroll:content`,
    bounds,
    accepts: ['scroll'],
    message: (event) => {
      const action = scrollActionForWheel(event, wheel);
      return action === undefined ? undefined : factory(scrollEvent(action, state, event, 'content'));
    }
  };
}

function scrollbarTrackHitTargets<TMessage>(
  id: string,
  axis: 'vertical' | 'horizontal',
  track: ScrollbarTrack,
  state: ScrollState,
  wheel: NormalizedScrollWheelPolicy,
  factory: (event: ScrollEvent) => TMessage
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
      return action === undefined ? undefined : factory(scrollEvent(
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
            return action === undefined ? undefined : factory(scrollEvent(
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
  widget: RenderNode,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): ScrollbarOptions | undefined {
  const raw = widget.props['scrollbar'];
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

function scrollWheelPolicyProp(widget: RenderNode): NormalizedScrollWheelPolicy {
  const raw = widget.props['scrollPolicy'];
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

export function tableScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const selected = selectedTableRow(widget);
  const window = dataWindow({
    totalRows: rows.length,
    viewportRows: bounds.height,
    selectedIndex: selected
  });
  const configured = normalizedRenderNodeScroll(widget, {
    offsetRow: scrollNumberProp(widget, 'offsetRow') ?? window.start,
    contentRows: scrollNumberProp(widget, 'contentRows') ?? rows.length,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return configured;
}

export function treeScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const rows = treeVisibleRows(widget);
  const scroll = normalizedRenderNodeScroll(widget, {
    contentRows: rows.length,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function viewportScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const state = viewportVisualState(widget, bounds);
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

export function scrollbackScrollbarState(widget: RenderNode, node: Pick<LayoutNode, 'bounds'>): ScrollState {
  const window = scrollbackWindow(widget, node);
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

export function paletteScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const entries = Array.isArray(widget.props['entries']) ? widget.props['entries'] : [];
  const scroll = normalizedRenderNodeScroll(widget, {
    contentRows: scrollNumberProp(widget, 'contentRows') ?? entries.length,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function menuScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const rows = countMenuRows(widget.props['items']);
  const scroll = normalizedRenderNodeScroll(widget, {
    contentRows: scrollNumberProp(widget, 'contentRows') ?? rows,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scroll;
}

export function textAreaScrollbarState(widget: RenderNode, bounds: Rect): ScrollState {
  const lines = textAreaLines(widget);
  const wrap = textAreaWrapEnabled(widget);
  const contentWidth = Math.max(0, bounds.width - textAreaPrefixWidth(widget, lines.length));
  const contentRows = wrap
    ? lines.reduce<number>((total, lineText) => total + wrappedTextAreaRows(lineText, contentWidth), 0)
    : lines.length;
  const contentColumns = wrap
    ? contentWidth
    : lines.reduce<number>((max, lineText) => Math.max(max, measureTextCells(lineText).cells), 0);
  const scroll = normalizedRenderNodeScroll(widget, {
    contentRows,
    contentColumns,
    viewportRows: bounds.height,
    viewportColumns: contentWidth
  });
  return scroll;
}

interface RenderNodeScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
}

function normalizedRenderNodeScroll(widget: RenderNode, input: RenderNodeScrollStateInput): ReturnType<typeof normalizeScrollState> {
  const raw = isRecord(widget.props['scroll']) ? widget.props['scroll'] : {};
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

function scrollNumberProp(widget: RenderNode, key: string): number | undefined {
  const raw = widget.props['scroll'];
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

function textAreaLines(widget: RenderNode): readonly string[] {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  const display = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  return display.length === 0 ? [''] : display.split('\n');
}

function textAreaWrapEnabled(widget: RenderNode): boolean {
  const raw = widget.props['wrap'];
  if (raw === true) return true;
  if (!isRecord(raw)) return false;
  const mode = raw['mode'];
  return mode === undefined || mode === 'soft';
}

function textAreaPrefixWidth(widget: RenderNode, lineCount: number): number {
  const raw = widget.props['lineNumbers'];
  if (raw !== true && !isRecord(raw)) return 2;
  const start = isRecord(raw) && typeof raw['start'] === 'number' && Number.isFinite(raw['start'])
    ? Math.floor(raw['start'])
    : 1;
  const minWidth = isRecord(raw) && typeof raw['minWidth'] === 'number' && Number.isFinite(raw['minWidth'])
    ? Math.max(1, Math.floor(raw['minWidth']))
    : 1;
  return Math.max(minWidth, String(start + Math.max(0, lineCount - 1)).length) + 4;
}

function wrappedTextAreaRows(lineText: string, width: number): number {
  if (lineText.length === 0) return 1;
  const cells = measureTextCells(lineText).cells;
  return width <= 0 ? 1 : Math.max(1, Math.ceil(cells / width));
}

function selectedTableRow(widget: RenderNode): number {
  const selectedCell = widget.props['selectedCell'];
  if (isRecord(selectedCell)) {
    const row = selectedCell['row'];
    if (typeof row === 'number' && Number.isFinite(row)) return Math.max(0, Math.floor(row));
  }
  return Math.max(0, Math.floor(numberProp(widget, 'selected') ?? 0));
}
