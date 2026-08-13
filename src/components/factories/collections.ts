import type { AccessibleNode } from '../../accessibility/index.ts';
import { createScrollState, normalizeScrollState } from '../../behavior/scroll.ts';
import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import { isRegisteredElement } from '../../element/registry.ts';
import type { Rect } from '../../geometry/types.ts';
import { assertOptionalCallback, assertRequiredCallback } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { pointerVisualState, preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import {
  ownSelectionState,
  prepareCollectionInteractionIndex,
  type CollectionInteractionIndex,
  type SelectionState,
} from '../../interaction/collection.ts';
import type {
  ListViewActivateEvent,
  ListViewProjection,
  ListViewRecord,
  ListViewTransition,
  SemanticListItem,
} from '../../ui-model/semantic-list.ts';
import type { ListViewStylePart, SemanticListStylePart } from '../../ui-model/style-parts.ts';
import type {
  ListOptions,
  ListViewOptions,
  ScrollableListViewOptions,
  UnscrolledListViewOptions,
} from '../options/collections.ts';

interface PreparedSemanticListItem {
  readonly id: string;
  readonly label?: string;
}

interface SemanticListModel {
  readonly items: readonly PreparedSemanticListItem[];
  readonly ordered: boolean;
}

const listSlots = {
  items: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

const listLayouts = new WeakMap<SemanticListModel, readonly Rect[]>();

const instantiateList = defineComponent<
  { readonly items: readonly PreparedSemanticListItem[]; readonly ordered?: boolean },
  SemanticListModel,
  never,
  SemanticListStylePart,
  readonly [],
  'optional',
  readonly ['layer', 'styles'],
  typeof listSlots
>({
  name: 'terminal-ui/components/list',
  identity: 'optional',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'list',
  slots: listSlots,
  metadata: ['layer', 'styles'],
  parts: ['marker', 'item'],
  prepare(value) {
    return {
      items: prepareItems(value.items, 'list'),
      ordered: value.ordered === true,
    };
  },
  measure(input) {
    const measurements = input.model.items.map((_item, index) => input.slots.measure('items', index));
    const markerWidth = semanticListMarkerWidth(input.model, input.widthProfile);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(0, ...measurements.map((item) => item.preferredWidth + markerWidth)),
      preferredHeight: measurements.reduce((sum, item) => sum + item.preferredHeight, 0),
    };
  },
  layout(input) {
    let row = 0;
    const markerWidth = semanticListMarkerWidth(input.model, input.widthProfile);
    const rects = input.model.items.map((_item, index): Rect => {
      const measured = input.slots.measure('items', index);
      const height = measured.preferredHeight;
      const rect = {
        row,
        column: markerWidth,
        width: Math.max(0, input.bounds.width - markerWidth),
        height,
      };
      row += height;
      return rect;
    });
    listLayouts.set(input.model, rects);
    return { items: rects };
  },
  renderBeforeChildren(input) {
    const markerWidth = semanticListMarkerWidth(input.model, input.widthProfile);
    for (const [index, rect] of (listLayouts.get(input.model) ?? []).entries()) {
      const item = input.model.items[index];
      if (item === undefined || rect.row >= input.bounds.height) continue;
      const marker = input.model.ordered
        ? `${String(index + 1)}.`
        : oneCellGlyph('•', '*', { widthProfile: input.widthProfile });
      const markerStyle = input.style({ part: 'marker' });
      const itemStyle = input.style({ part: 'item' });
      for (let row = Math.max(0, rect.row); row < Math.min(input.bounds.height, rect.row + rect.height); row += 1) {
        input.target.write(row, rect.column, [{
          text: ' '.repeat(rect.width),
          ...(itemStyle === undefined ? {} : { style: itemStyle }),
          source: input.source({
            partName: 'item',
            itemId: item.id,
            itemIndex: index,
          }),
        }]);
      }
      input.target.write(rect.row, 0, [{
        text: `${marker}${' '.repeat(Math.max(1, markerWidth - measureTextCells(marker, { widthProfile: input.widthProfile }).cells))}`,
        ...(markerStyle === undefined ? {} : { style: markerStyle }),
        source: input.source({
          partName: 'marker',
          itemId: item.id,
          itemIndex: index,
        }),
      }]);
    }
  },
  accessibility(input) {
    return {
      id: input.id,
      role: 'list',
      children: input.model.items.map((item, index) => ({
        id: `${input.id}:item:${item.id}`,
        role: 'listitem' as const,
        ...(item.label === undefined ? {} : { label: item.label }),
        position: { positionInSet: index + 1, setSize: input.model.items.length },
        children: input.slots.items[index] === undefined ? [] : [input.slots.items[index]],
      })),
    };
  },
});

export function list<const TItems extends readonly SemanticListItem[]>(
  options: ListOptions<TItems>,
): Element<ElementMessage<TItems[number]['content']>> {
  const items = preparePublicItems(options.items, 'list');
  return instantiateList({
    ...(options.id === undefined ? {} : { id: options.id }),
    items: items.map(({ id, label }) => ({ id, ...(label === undefined ? {} : { label }) })),
    ...(options.ordered === undefined ? {} : { ordered: options.ordered }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    slots: { items: items.map((item) => item.content) },
  });
}

interface ListViewModel {
  readonly items: readonly (PreparedSemanticListItem & {
    readonly itemIndex: number;
    readonly startRow: number;
    readonly rowCount: number;
    readonly disabled: boolean;
  })[];
  readonly totalCount: number;
  readonly totalRows: number;
  readonly interactionIndex: CollectionInteractionIndex;
  readonly positions: ReadonlyMap<string, number>;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

type ListViewComponentAction =
  | { readonly kind: 'transition'; readonly action: ListViewTransition }
  | { readonly kind: 'activate'; readonly event: ListViewActivateEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

interface ListViewLayout {
  readonly rects: readonly Rect[];
  readonly visibleIndexes: readonly number[];
  readonly scrollbar: ReturnType<typeof prepareComponentScrollbar>;
}

const listViewLayouts = new WeakMap<ListViewModel, ListViewLayout>();

const instantiateListView = defineComponent<
  ListViewModel,
  ListViewModel,
  ListViewComponentAction,
  ListViewStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof listSlots
>({
  name: 'terminal-ui/components/list-view',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'list',
  slots: listSlots,
  states: ['disabled', 'busy', 'readOnly', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['marker', 'item', 'scrollbar'],
  clipChildren: true,
  measure(input) {
    const measurements = input.model.items.map((_item, index) => input.slots.measure('items', index));
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(0, ...measurements.map((item) => item.preferredWidth + 2)),
      preferredHeight: input.model.totalRows,
    };
  },
  layout(input) {
    const scroll = prepareListViewScroll(input.model.scroll, input.model.totalRows, input.bounds);
    const initialScrollbar = prepareComponentScrollbar({
      bounds: input.bounds,
      scroll,
      contentRows: input.model.totalRows,
      contentColumns: input.bounds.width,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
    const activePosition = input.model.activeId === undefined
      ? undefined
      : input.model.positions.get(input.model.activeId);
    const active = activePosition === undefined ? undefined : input.model.items[activePosition];
    const offsetRow = active === undefined
      ? initialScrollbar.scroll.offsetRow
      : rowIntoViewOffset(
          initialScrollbar.scroll.offsetRow,
          initialScrollbar.contentBounds.height,
          active.startRow,
          active.rowCount,
          input.model.totalRows,
        );
    const scrollbar = prepareComponentScrollbar({
      bounds: input.bounds,
      scroll: {
        ...initialScrollbar.scroll,
        offsetRow,
        followTail: false,
      },
      contentRows: input.model.totalRows,
      contentColumns: input.bounds.width,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
    const viewportEnd = scrollbar.scroll.offsetRow + scrollbar.contentBounds.height;
    const visibleIndexes: number[] = [];
    const rects = input.model.items.map((item, index): Rect => {
      const itemEnd = item.startRow + item.rowCount;
      if (item.startRow >= viewportEnd || itemEnd <= scrollbar.scroll.offsetRow) {
        return { row: 0, column: 0, width: 0, height: 0 };
      }
      visibleIndexes.push(index);
      return {
        row: item.startRow - scrollbar.scroll.offsetRow,
        column: 2,
        width: Math.max(0, scrollbar.contentBounds.width - 2),
        height: item.rowCount,
      };
    });
    listViewLayouts.set(input.model, {
      rects,
      visibleIndexes: Object.freeze(visibleIndexes),
      scrollbar,
    });
    return { items: rects };
  },
  renderBeforeChildren(input) {
    const layout = listViewLayouts.get(input.model);
    if (layout === undefined) return;
    for (const index of layout.visibleIndexes) {
      const item = input.model.items[index];
      const rect = layout.rects[index];
      if (item === undefined || rect === undefined) continue;
      const active = item.id === input.model.activeId;
      const selected = selectionContains(input.model.selection, item.id);
      const pointer = pointerVisualState(
        input.model.pointerState,
        `${input.id ?? 'list-view'}:item:${item.id}`,
      );
      const state = item.disabled ? 'disabled' : pointer ?? (active ? 'active' : selected ? 'selected' : undefined);
      const markerStyle = input.style({ part: 'marker', ...(state === undefined ? {} : { state }) });
      const itemStyle = input.style({ part: 'item', ...(state === undefined ? {} : { state }) });
      for (let row = Math.max(0, rect.row); row < Math.min(input.bounds.height, rect.row + rect.height); row += 1) {
        input.target.write(row, rect.column, [{
          text: ' '.repeat(rect.width),
          ...(itemStyle === undefined ? {} : { style: itemStyle }),
          source: input.source({
            partName: 'item',
            itemId: item.id,
            itemIndex: item.itemIndex,
            ...(state === undefined ? {} : { interactionState: state }),
          }),
        }]);
      }
      const marker = active
        ? oneCellGlyph('›', '>', { widthProfile: input.widthProfile })
        : selected
          ? oneCellGlyph('●', '*', { widthProfile: input.widthProfile })
          : ' ';
      input.target.write(Math.max(0, rect.row), 0, [{
        text: `${marker} `,
        ...(markerStyle === undefined ? {} : { style: markerStyle }),
        source: input.source({
          partName: 'marker',
          itemId: item.id,
          itemIndex: item.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
        }),
      }]);
    }
    paintComponentScrollbar({
      target: input.target,
      plan: layout.scrollbar,
      theme: input.theme,
      source: (sourceInput) => input.source(sourceInput),
    });
  },
  keys({ model, busy, readOnly }) {
    if (busy) return {};
    const activeIndex = model.activeId === undefined
      ? -1
      : model.positions.get(model.activeId) ?? -1;
    const active = model.items[activeIndex];
    return {
      arrowUp: () => transition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveActive', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      ...(readOnly ? {} : { space: () => transition({ kind: 'commitActive' }) }),
      ...(readOnly || active === undefined || active.disabled
        ? {}
        : { enter: () => activate(active.id, active.itemIndex) }),
    };
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets(input) {
    const layout = listViewLayouts.get(input.model);
    const index = input.model.activeId === undefined
      ? -1
      : input.model.positions.get(input.model.activeId) ?? -1;
    const rect = index < 0 ? undefined : layout?.rects[index];
    return [{
      id: 'self',
      bounds: layout?.scrollbar.contentBounds ?? input.bounds,
      ...(rect === undefined || rect.height === 0 ? {} : { cursor: { row: Math.max(0, rect.row), column: 0 } }),
    }];
  },
  hitTargets(input) {
    if (input.busy) return [];
    const layout = listViewLayouts.get(input.model);
    if (layout === undefined) return [];
    return [
      ...layout.visibleIndexes.flatMap((index) => {
        const item = input.model.items[index];
        const rect = layout.rects[index];
        if (item === undefined || item.disabled || rect === undefined || rect.height === 0) return [];
        return [{
          id: `${input.id ?? 'list-view'}:item:${item.id}`,
          bounds: { row: Math.max(0, rect.row), column: 0, width: input.bounds.width, height: rect.height },
          accepts: ['click'] as const,
          cursor: 'pointer' as const,
          message: (event: RoutedPointerEvent) => event.clickCount === 2 && !input.readOnly
            ? activate(item.id, item.itemIndex)
            : transition({ kind: 'setActive', id: item.id }),
        }];
      }),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<ListViewComponentAction>({
        id: input.id ?? 'list-view',
        plan: layout.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => transition({ kind: 'scroll', event }),
      })),
    ];
  },
  accessibility(input) {
    const layout = listViewLayouts.get(input.model);
    const visible = new Set(layout?.visibleIndexes ?? input.model.items.map((_item, index) => index));
    const children: AccessibleNode[] = input.model.items.flatMap((item, index) => {
      if (!visible.has(index)) return [];
      const child = input.slots.items[index];
      return [{
        id: `${input.id}:item:${item.id}`,
        role: 'listitem' as const,
        ...(item.label === undefined ? {} : { label: item.label }),
        selected: selectionContains(input.model.selection, item.id),
        disabled: item.disabled,
        position: { positionInSet: item.itemIndex + 1, setSize: input.model.totalCount },
        children: child === undefined ? [] : [child],
      }];
    });
    return {
      id: input.id,
      role: 'list',
      ...(input.focused ? { focused: true } : {}),
      ...(input.model.activeId === undefined ? {} : { activeDescendant: `${input.id}:item:${input.model.activeId}` }),
      children,
    };
  },
});

export function listView<
  const TProjection extends ListViewProjection,
  const TMessage extends ComponentMessage = never,
>(
  options: ScrollableListViewOptions<TProjection, TMessage>,
): Element<TMessage | ElementMessage<TProjection['records'][number]['content']>>;
export function listView<
  const TProjection extends ListViewProjection,
  const TMessage extends ComponentMessage = never,
>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledListViewOptions<TProjection, TMessage>,
): Element<TMessage | ElementMessage<TProjection['records'][number]['content']>>;
export function listView<
  const TProjection extends ListViewProjection,
  const TMessage extends ComponentMessage = never,
>(
  options: ListViewOptions<TProjection, TMessage>,
): Element<TMessage | ElementMessage<TProjection['records'][number]['content']>> {
  const projection = preparePublicListViewProjection(options.projection);
  const items = projection.records;
  const scroll = prepareComponentScrollState(options.presentation.scroll, 'listView scroll');
  const scrollbar = prepareComponentScrollbarOptions(options.scrollbar, 'listView scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(options.scrollPolicy, 'listView scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('listView scrollbar and scrollPolicy require scroll state.');
  }
  const pointerState = preparePointerInteractionState(
    options.pointerState,
    'listView pointerState',
    options.disabled !== true && options.inert !== true,
  );
  const model: ListViewModel = {
    items: items.map(({ id, label, disabled, itemIndex, startRow, rowCount }) => ({
      id,
      ...(label === undefined ? {} : { label }),
      disabled: disabled === true,
      itemIndex,
      startRow,
      rowCount,
    })),
    totalCount: projection.totalCount,
    totalRows: projection.totalRows,
    interactionIndex: prepareCollectionInteractionIndex(items.filter((item) => !item.disabled).map((item) => item.id)),
    positions: new Map(items.map((item, index) => [item.id, index])),
    ...(options.presentation.activeId === undefined ? {} : { activeId: options.presentation.activeId }),
    selection: ownSelectionState(options.presentation.selection, 'listView selection'),
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
  const shared = {
    ...model,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    slots: { items: items.map((item) => item.content) },
  };
  if (options.disabled === true) return instantiateListView({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateListView({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'listView onTransition');
  assertOptionalCallback(options.onActivate, 'listView onActivate');
  assertOptionalCallback(options.onPointerAction, 'listView onPointerAction');
  return instantiateListView({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (action.kind === 'pointer') return options.onPointerAction?.(action.action) ?? ignoreMessage();
      if (isScrollableListViewOptions(options)) return options.onTransition(action.action);
      return action.action.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.action);
    },
  });
}

function isScrollableListViewOptions<
  TProjection extends ListViewProjection,
  TMessage extends ComponentMessage,
>(
  options: ListViewOptions<TProjection, TMessage>,
): options is ScrollableListViewOptions<TProjection, TMessage> {
  return options.presentation.scroll !== undefined;
}

function prepareItems(
  items: readonly PreparedSemanticListItem[],
  owner: string,
): readonly PreparedSemanticListItem[] {
  const ids = new Set<string>();
  return Object.freeze(items.map((item) => {
    const id = cleanId(item.id, `${owner} item id`);
    if (ids.has(id)) throw new TypeError(`${owner} item ids must be unique; duplicate id: ${id}`);
    ids.add(id);
    const label = item.label === undefined ? undefined : sanitizeTerminalText(item.label).text;
    return Object.freeze({ id, ...(label === undefined ? {} : { label }) });
  }));
}

function semanticListMarkerWidth(
  model: SemanticListModel,
  widthProfile: TextWidthProfile,
): number {
  if (!model.ordered) return 2;
  const marker = `${String(Math.max(1, model.items.length))}.`;
  return measureTextCells(marker, { widthProfile }).cells + 1;
}

function preparePublicItems<TItems extends readonly SemanticListItem[]>(
  items: TItems,
  owner: string,
): readonly {
  readonly id: string;
  readonly label?: string;
  readonly content: TItems[number]['content'];
}[] {
  if (!Array.isArray(items)) throw new TypeError(`${owner} items must be an array.`);
  const prepared = prepareItems(items, owner);
  return Object.freeze(items.map((item, index) => Object.freeze({
    id: prepared[index]?.id ?? item.id,
    ...(prepared[index]?.label === undefined ? {} : { label: prepared[index].label }),
    content: item.content,
  })));
}

function preparePublicListViewProjection(
  value: unknown,
): ListViewProjection & { readonly records: readonly (ListViewRecord & { readonly disabled: boolean })[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('listView projection must be an object.');
  }
  const projection = value as Readonly<Record<string, unknown>>;
  const totalCount = projection['totalCount'];
  const totalRows = projection['totalRows'];
  if (typeof totalCount !== 'number' || !Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new RangeError('listView projection totalCount must be a non-negative safe integer.');
  }
  if (typeof totalRows !== 'number' || !Number.isSafeInteger(totalRows) || totalRows < 0) {
    throw new RangeError('listView projection totalRows must be a non-negative safe integer.');
  }
  const suppliedRecords = projection['records'];
  if (!Array.isArray(suppliedRecords)) throw new TypeError('listView projection records must be an array.');
  const ids = new Set<string>();
  let previousItemIndex = -1;
  let previousEndRow = -1;
  const records = Object.freeze(suppliedRecords.map((value): ListViewRecord & { readonly disabled: boolean } => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('listView records must be objects.');
    }
    const item = value as Readonly<Record<string, unknown>>;
    const id = cleanId(item['id'], 'listView item id');
    if (ids.has(id)) throw new TypeError(`listView item ids must be unique; duplicate id: ${id}`);
    ids.add(id);
    const itemIndex = item['itemIndex'];
    const startRow = item['startRow'];
    const rowCount = item['rowCount'];
    if (typeof itemIndex !== 'number'
      || !Number.isSafeInteger(itemIndex)
      || itemIndex <= previousItemIndex
      || itemIndex >= totalCount) {
      throw new RangeError('listView record itemIndex values must be ascending and less than totalCount.');
    }
    if (typeof startRow !== 'number'
      || !Number.isSafeInteger(startRow)
      || startRow < 0
      || startRow < previousEndRow) {
      throw new RangeError('listView record startRow values must be non-negative and non-overlapping.');
    }
    if (typeof rowCount !== 'number'
      || !Number.isSafeInteger(rowCount)
      || rowCount < 1
      || startRow + rowCount > totalRows) {
      throw new RangeError('listView record rowCount must be positive and fit inside totalRows.');
    }
    const content = item['content'];
    if (!isRegisteredElement(content)) {
      throw new TypeError('listView record content must be an Element created by this package instance.');
    }
    const label = item['label'];
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('listView item label must be a string.');
    }
    const disabled = item['disabled'];
    if (disabled !== undefined && typeof disabled !== 'boolean') {
      throw new TypeError('listView record disabled must be a boolean.');
    }
    previousItemIndex = itemIndex;
    previousEndRow = startRow + rowCount;
    return Object.freeze({
      id,
      content,
      itemIndex,
      startRow,
      rowCount,
      ...(label === undefined ? {} : { label: sanitizeTerminalText(label).text }),
      disabled: disabled === true,
    });
  }));
  return Object.freeze({ records, totalCount, totalRows });
}

function cleanId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const id = sanitizeTerminalText(value).text.trim();
  if (id.length === 0) throw new TypeError(`${label} must not be empty.`);
  return id;
}

function prepareListViewScroll(scroll: ScrollState | undefined, totalRows: number, bounds: Rect): ScrollState {
  return scroll === undefined
    ? createScrollState()
    : normalizeScrollState(scroll, {
      contentRows: totalRows,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width,
    });
}

function rowIntoViewOffset(
  offset: number,
  viewportRows: number,
  startRow: number,
  rowCount: number,
  totalRows: number,
): number {
  if (startRow < offset) return startRow;
  const endRow = startRow + rowCount;
  if (endRow <= offset + viewportRows) return offset;
  return Math.min(Math.max(0, totalRows - viewportRows), Math.max(startRow, endRow - viewportRows));
}

function selectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

function transition(action: ListViewTransition): ListViewComponentAction {
  return { kind: 'transition', action };
}

function activate(id: string, itemIndex: number): ListViewComponentAction {
  return { kind: 'activate', event: { kind: 'activate', id, itemIndex } };
}
