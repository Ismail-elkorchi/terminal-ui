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
  type SelectionState,
} from '../../interaction/collection.ts';
import type {
  ListViewActivateEvent,
  ListViewRenderedItem,
  ListViewTransition,
  SemanticListItem,
} from '../../ui-model/semantic-list.ts';
import { isMeasuredWindow } from '../../behavior/measured-window.ts';
import type { MeasuredWindow } from '../../behavior/measured-window.ts';
import type { ListViewStylePart, SemanticListStylePart } from '../../ui-model/style-parts.ts';
import type {
  ListOptions,
  ListViewOptions,
  ScrollableListViewOptions,
  UnscrolledListViewOptions,
} from '../options/collections.ts';
import { inspectSelection } from '../internal/inspection.ts';
import { measuredItemViewport } from '../../layout/factories/measured-column.ts';

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
    readonly rowOffset: number;
    readonly visibleRows: number;
    readonly disabled: boolean;
  })[];
  readonly totalCount: number;
  readonly totalRows: number;
  readonly viewportRows: number;
  readonly offsetRow: number;
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
  readonly ['disabled', 'busy', 'inert'],
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
  states: ['disabled', 'busy', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['marker', 'item', 'scrollbar'],
  inspection: ({ model }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: model.items[0]?.itemIndex ?? 0,
      totalCount: model.totalCount,
      visibleCount: model.items.length,
    },
  }),
  clipChildren: true,
  measure(input) {
    const measurements = input.model.items.map((item, index) => {
      const measurement = input.slots.measure('items', index);
      if (measurement.preferredHeight !== item.visibleRows) {
        throw new RangeError(
          `listView item viewport "${item.id}" measured ${String(measurement.preferredHeight)} rows; its measured window declares ${String(item.visibleRows)} visible rows.`,
        );
      }
      return measurement;
    });
    return {
      minWidth: 0,
      minHeight: input.model.viewportRows,
      preferredWidth: Math.max(0, ...measurements.map((item) => item.preferredWidth + 2)),
      preferredHeight: input.model.viewportRows,
      maxHeight: input.model.viewportRows,
    };
  },
  layout(input) {
    input.model.items.forEach((item, index) => {
      const measurement = input.slots.measure('items', index);
      if (measurement.preferredHeight !== item.visibleRows) {
        throw new RangeError(
          `listView item viewport "${item.id}" measured ${String(measurement.preferredHeight)} rows; its measured window declares ${String(item.visibleRows)} visible rows.`,
        );
      }
    });
    if (input.bounds.height !== input.model.viewportRows) {
      throw new RangeError(
        `listView measured window has ${String(input.model.viewportRows)} viewport rows but received ${String(input.bounds.height)} layout rows.`,
      );
    }
    const scroll = prepareListViewScroll(input.model.scroll, input.model.totalRows, input.bounds);
    const initialScrollbar = prepareComponentScrollbar({
      bounds: input.bounds,
      scroll,
      contentRows: input.model.totalRows,
      contentColumns: input.bounds.width,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
    const scrollbar = prepareComponentScrollbar({
      bounds: input.bounds,
      scroll: {
        ...initialScrollbar.scroll,
        offsetRow: input.model.offsetRow,
      },
      contentRows: input.model.totalRows,
      contentColumns: input.bounds.width,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
    const visibleIndexes: number[] = [];
    const rects = input.model.items.map((item, index): Rect => {
      if (item.visibleRows === 0 || item.rowOffset >= scrollbar.contentBounds.height) {
        return { row: 0, column: 0, width: 0, height: 0 };
      }
      visibleIndexes.push(index);
      return {
        row: item.rowOffset,
        column: 2,
        width: Math.max(0, scrollbar.contentBounds.width - 2),
        height: Math.min(item.visibleRows, scrollbar.contentBounds.height - item.rowOffset),
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
  keys({ model, busy }) {
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
      space: () => transition({ kind: 'commitActive' }),
      ...(active === undefined || active.disabled
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
          bounds: {
            row: Math.max(0, rect.row),
            column: 0,
            width: layout.scrollbar.contentBounds.width,
            height: rect.height,
          },
          accepts: ['click'] as const,
          cursor: 'pointer' as const,
          message: (event: RoutedPointerEvent) => event.clickCount === 2
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
        children: child?.children ?? [],
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

/** @beta */
export function listView<
  const TValue,
  const TContent extends Element<ComponentMessage>,
  const TMessage extends ComponentMessage = never,
>(
  options: ScrollableListViewOptions<TValue, TContent, TMessage>,
): Element<TMessage | ElementMessage<TContent>>;
export function listView<
  const TValue,
  const TContent extends Element<ComponentMessage>,
  const TMessage extends ComponentMessage = never,
>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledListViewOptions<TValue, TContent, TMessage>,
): Element<TMessage | ElementMessage<TContent>>;
export function listView<
  const TValue,
  const TContent extends Element<ComponentMessage>,
  const TMessage extends ComponentMessage = never,
>(
  options: ListViewOptions<TValue, TContent, TMessage>,
): Element<TMessage | ElementMessage<TContent>> {
  const window = prepareListViewWindow(options.window);
  if (typeof options.renderItem !== 'function') {
    throw new TypeError('listView renderItem must be a function.');
  }
  const items = window.entries.map((entry) => {
    const rendered = prepareRenderedListViewItem(
      options.renderItem(entry.item, entry.itemIndex),
      entry.item.id,
    );
    return {
      id: entry.item.id,
      ...(rendered.label === undefined ? {} : { label: rendered.label }),
      disabled: rendered.disabled,
      itemIndex: entry.itemIndex,
      rowOffset: entry.rowOffset,
      visibleRows: entry.visibleRows,
      content: measuredItemViewport(rendered.content, {
        rows: entry.item.rows,
        clippedRowsBefore: entry.clippedRowsBefore,
        visibleRows: entry.visibleRows,
      }),
    };
  });
  const scroll = prepareComponentScrollState(options.presentation.scroll, 'listView scroll');
  const scrollbar = prepareComponentScrollbarOptions(options.scrollbar, 'listView scrollbar');
  if (scrollbar?.axis !== undefined && scrollbar.axis !== 'vertical') {
    throw new TypeError('listView scrollbar axis must be vertical.');
  }
  const scrollPolicy = prepareComponentScrollPolicy(options.scrollPolicy, 'listView scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('listView scrollbar and scrollPolicy require scroll state.');
  }
  if (scroll === undefined && window.offsetRow !== 0) {
    throw new TypeError('An unscrolled listView requires a measured window at offset row zero.');
  }
  if (scroll !== undefined && scroll.offsetRow !== window.offsetRow) {
    throw new TypeError('listView scroll offset must equal its measured window offset.');
  }
  const pointerState = preparePointerInteractionState(
    options.pointerState,
    'listView pointerState',
    options.disabled !== true && options.inert !== true,
  );
  if (options.presentation.activeId !== undefined
    && !items.some((item) => item.id === options.presentation.activeId)) {
    throw new RangeError('listView activeId must identify an item in the supplied measured window.');
  }
  const model: ListViewModel = {
    items: items.map(({
      id,
      label,
      disabled,
      itemIndex,
      rowOffset,
      visibleRows,
    }) => ({
      id,
      ...(label === undefined ? {} : { label }),
      disabled: disabled,
      itemIndex,
      rowOffset,
      visibleRows,
    })),
    totalCount: window.endIndexExclusive + window.omittedAfter,
    totalRows: window.totalRows,
    viewportRows: window.viewportRows,
    offsetRow: window.offsetRow,
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
  TValue,
  TContent extends Element<ComponentMessage>,
  TMessage extends ComponentMessage,
>(
  options: ListViewOptions<TValue, TContent, TMessage>,
): options is ScrollableListViewOptions<TValue, TContent, TMessage> {
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

function prepareListViewWindow<TValue>(value: MeasuredWindow<TValue>): MeasuredWindow<TValue> {
  if (!isMeasuredWindow(value)) {
    throw new TypeError('listView window must be created with measuredWindow().');
  }
  return value;
}

function prepareRenderedListViewItem<TContent extends Element<ComponentMessage>>(
  value: ListViewRenderedItem<TContent>,
  id: string,
): ListViewRenderedItem<TContent> & { readonly disabled: boolean } {
  const candidate: unknown = value;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(`listView renderItem for "${id}" must return an object.`);
  }
  if (!isRegisteredElement(value.content)) {
    throw new TypeError(`listView renderItem for "${id}" must return registered Element content.`);
  }
  if (value.label !== undefined && typeof value.label !== 'string') {
    throw new TypeError(`listView renderItem label for "${id}" must be a string.`);
  }
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
    throw new TypeError(`listView renderItem disabled for "${id}" must be a boolean.`);
  }
  return Object.freeze({
    content: value.content,
    ...(value.label === undefined ? {} : { label: sanitizeTerminalText(value.label).text }),
    disabled: value.disabled === true,
  });
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
