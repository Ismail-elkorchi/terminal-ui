import { resolveControlKeymap, type ControlKeymap } from '../../interaction/control-keymap.ts';
import { createListboxKeymap, type ListboxKeyAction } from '../keymaps.ts';
import { controlKeyBindings } from '../shared/control-key-bindings.ts';
const defaultListboxKeymap = createListboxKeymap();
import { listboxViewForOptions } from '../../behavior/listbox-operations.ts';
import type {
  ListboxActivateEvent,
  ListboxTransition,
  ListboxViewEntry,
} from '../../behavior/listbox.ts';
import { createScrollState, normalizeScrollState, scrollReducer } from '../../behavior/scroll.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import {
  componentScrollbarHitTargets,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  layoutComponentScrollbar,
  paintComponentScrollbar,
} from '../../component/scrollbar.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  assertRequiredPropertyCallback,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  decodeSelectionState,
  selectionContains,
  type SelectionState,
} from '../../interaction/collection-interaction.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { CompiledCollectionQuery, QueryMatchRange } from '../../text/query.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import { terminalStyleHasBackground } from '../../theme/theme.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderLine, line, padRenderLine } from '../../visual/render-content.ts';
import { inspectSelection } from '../shared/inspection.ts';
import type { DataListStylePart } from '../style-parts.ts';
import type {
  ListboxOptions,
  ScrollableListboxOptions,
  UnscrolledListboxOptions,
} from './options.ts';

type ListEntryModel = ListboxViewEntry<unknown>;

interface ListboxModel {
  readonly keymap: ControlKeymap<ListboxKeyAction>;
  readonly entries: readonly ListEntryModel[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly windowed: boolean;
  readonly query: CompiledCollectionQuery;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

const listboxDefinitionBase = {
  name: 'terminal-ui/components/listbox' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'listbox' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['marker', 'item', 'description', 'match', 'empty', 'scrollbarTrack', 'scrollbarThumb'] as const,
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy'] as const,
  states: ['disabled', 'busy', 'inert'] as const,
  measure: measureListbox,
  retainPaint: true as const,
  render: renderListbox,
  accessibility: accessibleListbox,
  inspection: ({ model }: { readonly model: Readonly<ListboxModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: model.startIndex,
      totalCount: model.totalCount,
      visibleCount: model.entries.length,
    },
  }),
};

type ListboxComponentAction =
  | { readonly kind: 'transition'; readonly transition: ListboxTransition }
  | { readonly kind: 'activate'; readonly event: ListboxActivateEvent };

const instantiateListbox = defineComponent<ListboxModel, ListboxComponentAction>()({
  ...listboxDefinitionBase,
  keys({ model, busy }) {
    if (busy) return {};
    const active = activeEntry(model);
    return controlKeyBindings<ListboxKeyAction, ListboxComponentAction>(model.keymap, {
      previous: () => transition({ kind: 'moveActive', delta: -1 }),
      next: () => transition({ kind: 'moveActive', delta: 1 }),
      previousPage: () => transition({ kind: 'pageActive', delta: -1 }),
      nextPage: () => transition({ kind: 'pageActive', delta: 1 }),
      first: () => transition({ kind: 'firstActive' }),
      last: () => transition({ kind: 'lastActive' }),
      select: () => transition({ kind: 'commitActive' }),
      ...(active === undefined || active.option.disabled
        ? {}
        : { activate: () => activate(active) }),
    });
  },
  focusTargets(input) {
    const plan = listPlan(input.model, input.bounds);
    const active = plan.rows.findIndex((entry) => entry.id === input.model.activeId);
    return [{
      id: 'self',
      bounds: plan.scrollbar.contentBounds,
      ...(active < 0 ? {} : {
        cursor: {
          row: plan.scrollbar.contentBounds.row + active,
          column: plan.scrollbar.contentBounds.column,
        },
      }),
    }];
  },
  hitTargets(input) {
    if (input.busy) return [];
    const plan = listPlan(input.model, input.bounds);
    return [
      ...plan.rows.flatMap((entry, row) =>
        entry.option.disabled ? [] : [{
          id: `${input.id ?? 'list'}:option:${entry.id}`,
          bounds: {
            row: plan.scrollbar.contentBounds.row + row,
            column: plan.scrollbar.contentBounds.column,
            width: plan.scrollbar.contentBounds.width,
            height: 1,
          },
          accepts: ['pointerDown', 'click'] as const,
          cursor: 'pointer' as const,
          message: (event: RoutedPointerEvent) => {
            if (event.button !== 'left') return ignoreMessage();
            if (event.kind === 'pointerDown') return transition({ kind: 'setActive', id: entry.id });
            return event.clickCount === 2
              ? activate(entry)
              : ignoreMessage();
          },
        }]
      ),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<ListboxComponentAction>({
        id: input.id ?? 'listbox',
        plan: plan.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => transition({ kind: 'scroll', request }),
      })),
    ];
  },
});

export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  options: ScrollableListboxOptions<TValue, TMessage>,
): Element<TMessage>;
export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledListboxOptions<TValue, TMessage>,
): Element<TMessage>;
export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  options: ListboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const model = createListboxModel(options);
  if (options.disabled === true && options.onTransition === undefined) return instantiateListbox({
    ...model,
    id: options.id,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  if (options.inert === true && options.onTransition === undefined) return instantiateListbox({
    ...model,
    id: options.id,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  assertRequiredPropertyCallback(options, 'onTransition', 'listbox onTransition');
  assertOptionalCallback(options.onActivate, 'listbox onActivate');
  return instantiateListbox({
    ...model,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (isScrollableListboxOptions(options)) return options.onTransition(action.transition);
      return action.transition.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.transition);
    },
  });
}

function isScrollableListboxOptions<TValue, TMessage extends ComponentMessage>(
  options: ListboxOptions<TValue, TMessage>,
): options is ScrollableListboxOptions<TValue, TMessage> {
  return options.state.scroll !== undefined;
}

function createListboxModel<TValue, TMessage extends ComponentMessage>(
  value: Readonly<ListboxOptions<TValue, TMessage>>,
): ListboxModel {
  const view = listboxViewForOptions(value);
  const activeId = optionalCleanString(value.state.activeId, 'listbox activeId');
  const selection = decodeSelectionState(value.state.selection, 'listbox selection');
  const scroll = decodeComponentScrollState(value.state.scroll, 'listbox scroll');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'listbox scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'listbox scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('listbox scrollbar and scrollPolicy require scroll state.');
  }
  return {
    keymap: resolveControlKeymap(value.keymap, defaultListboxKeymap),
    entries: view.entries,
    startIndex: view.startIndex,
    totalCount: view.totalCount,
    windowed: view.source.kind === 'window',
    query: view.query,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function measureListbox(
  { model, widthProfile }: {
    readonly model: ListboxModel;
    readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  },
) {
  const rows = model.entries.slice(0, 64);
  const preferredWidth = Math.max(
    1,
    ...rows.map((entry) =>
      measureTextCells(
        `${entry.option.label}${entry.option.description === undefined ? '' : ` · ${entry.option.description}`}`,
        { widthProfile },
      ).cells + 2
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth,
    preferredHeight: Math.max(1, Math.min(64, model.totalCount)),
  };
}

function renderListbox(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
): undefined {
  const plan = listPlan(input.model, input.bounds);
  if (plan.rows.length === 0 && plan.scrollbar.contentBounds.height > 0) {
    const emptyStyle = input.style({
      part: 'empty',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    input.target.write(0, 0, [{
      text: input.model.query.text.length === 0 ? 'No items' : 'No matching items',
      ...(emptyStyle === undefined ? {} : { style: emptyStyle }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'empty',
        partType: 'text',
        description: input.model.query.text.length === 0 ? 'empty' : 'filter.empty',
      }),
    }]);
  }
  for (const [row, entry] of plan.rows.entries()) {
    renderListboxRow(input, plan, entry, row);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: plan.scrollbar,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function renderListboxRow(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  plan: ReturnType<typeof listPlan>,
  entry: ListEntryModel,
  row: number,
): void {
  const selected = selectionContains(input.model.selection, entry.id);
  const active = entry.id === input.model.activeId;
  const pointer = pointerVisualState(input.pointerState, `${input.id ?? 'listbox'}:option:${entry.id}`);
  const states = entry.option.disabled
    ? ['disabled' as const]
    : [
      ...(selected ? ['selected' as const] : []),
      ...(active ? ['active' as const] : []),
      ...(pointer === undefined ? [] : [pointer]),
    ];
  const state = states.at(-1);
  const itemStyle = input.style({
    part: 'item',
    base: selected
      ? {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
      }
      : { fg: { kind: 'theme', token: 'text.default' } },
    ...(states.length === 0 ? {} : { states }),
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(states.length === 0 ? {} : { states }),
    ...(itemStyle === undefined ? {} : { base: itemStyle }),
  });
  const spans = listboxRowSpans(input, entry, selected, states, state, itemStyle, markerStyle);
  const clipped = clipRenderLine(line(spans), plan.scrollbar.contentBounds.width, {
    widthProfile: input.widthProfile,
  });
  input.target.writeLine(
    plan.scrollbar.contentBounds.row + row,
    plan.scrollbar.contentBounds.column,
    padRenderLine(clipped, plan.scrollbar.contentBounds.width, {
      widthProfile: input.widthProfile,
      fill: listboxPaddingSpan(input, entry, state, itemStyle),
    }),
  );
}

function listboxRowSpans(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  selected: boolean,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
  itemStyle: TerminalStyle | undefined,
  markerStyle: TerminalStyle | undefined,
): readonly RenderSpan[] {
  return [
    {
      text: selected && !terminalStyleHasBackground(markerStyle, input.theme)
        ? input.theme.tokens.symbols.selected
        : input.theme.tokens.symbols.unselected,
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'marker',
        partType: 'marker',
        description: `item.${entry.id}.marker`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
        ...(state === undefined ? {} : { interactionState: state }),
      }),
    },
    {
      text: ' ',
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'marker.gap',
        partType: 'spacing',
        description: `item.${entry.id}.marker.gap`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
      }),
    },
    ...highlightedListLabel(entry.option.label, entry.matches, itemStyle, input, entry, states),
    ...listboxDescriptionSpans(input, entry, states, state),
  ];
}

function listboxDescriptionSpans(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
): readonly RenderSpan[] {
  if (entry.option.description === undefined) return [];
  return [{
    text: ` · ${entry.option.description}`,
    ...optionalSpanStyle(input.style({
      part: 'description',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
      ...(states.length === 0 ? {} : { states }),
    })),
    source: input.frameSource({
      cellRole: 'text',
      partName: 'description',
      partType: 'text',
      description: `item.${entry.id}.description`,
      itemId: entry.id,
      itemIndex: entry.itemIndex,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  }];
}

function listboxPaddingSpan(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
  style: TerminalStyle | undefined,
): RenderSpan {
  return {
    text: ' ',
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'padding',
      partType: 'spacing',
      description: `item.${entry.id}.padding`,
      itemId: entry.id,
      itemIndex: entry.itemIndex,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  };
}

function accessibleListbox(
  input: import('../../component/index.ts').ComponentAccessibilityInput<ListboxModel>,
) {
  const plan = listPlan(input.model, input.bounds);
  return {
    id: input.id,
    role: 'listbox' as const,
    description: input.model.totalCount === 0
      ? 'Showing 0 items.'
      : `Showing ${String(plan.startIndex + 1)}-${String(plan.startIndex + plan.rows.length)} of ${
        String(input.model.totalCount)
      } items.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.activeId === undefined
      ? {}
      : input.model.entries.some((item) => item.id === input.model.activeId)
        ? { activeDescendant: `${input.id}:option:${input.model.activeId}` }
        : {}),
    ...(input.model.selection.mode === 'multiple' ? { multiSelectable: true } : {}),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.startIndex + plan.rows.length,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.startIndex - plan.rows.length),
    },
    children: plan.rows.map((entry) => ({
      id: `${input.id}:option:${entry.id}`,
      role: 'option' as const,
      label: entry.option.label,
      ...(entry.option.description === undefined ? {} : { description: entry.option.description }),
      selected: selectionContains(input.model.selection, entry.id),
      disabled: entry.option.disabled,
      position: {
        positionInSet: (input.model.windowed ? entry.itemIndex : entry.visibleIndex) + 1,
        setSize: input.model.totalCount,
      },
    })),
  };
}

function listPlan(model: ListboxModel, bounds: import('../../geometry/types.ts').Rect) {
  const active = activeEntry(model);
  const base = model.scroll === undefined
    ? active === undefined
      ? createScrollState()
      : scrollReducer(
        createScrollState(),
        {
          kind: 'itemIntoView',
          itemIndex: model.windowed ? active.itemIndex : active.visibleIndex,
          alignment: 'center',
        },
        {
          contentRows: model.totalCount,
          contentColumns: bounds.width,
          viewportRows: bounds.height,
          viewportColumns: bounds.width,
        },
      )
    : normalizeScrollState(model.scroll, {
      contentRows: model.totalCount,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width,
    });
  const scrollbar = layoutComponentScrollbar({
    bounds,
    scroll: base,
    contentRows: model.totalCount,
    contentColumns: bounds.width,
    ...(model.scrollbar === undefined ? {} : { options: model.scrollbar }),
    defaultAxis: 'vertical',
  });
  const requestedStart = scrollbar.scroll.offsetRow;
  const startIndex = model.windowed
    ? Math.max(
      model.startIndex,
      Math.min(
        Math.max(
          model.startIndex,
          model.startIndex + model.entries.length - scrollbar.contentBounds.height,
        ),
        requestedStart,
      ),
    )
    : requestedStart;
  const rows = model.windowed
    ? model.entries.slice(
      startIndex - model.startIndex,
      startIndex - model.startIndex + scrollbar.contentBounds.height,
    )
    : model.entries.slice(startIndex, startIndex + scrollbar.contentBounds.height);
  return { scrollbar, startIndex, rows };
}

function highlightedListLabel(
  label: string,
  matches: readonly QueryMatchRange[] | undefined,
  base: TerminalStyle | undefined,
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): readonly RenderSpan[] {
  const state = states.at(-1);
  const sourceState = state;
  if (matches === undefined || matches.length === 0) {
    return [{
      text: label,
      ...(base === undefined ? {} : { style: base }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'item',
        partType: 'text',
        description: `item.${entry.id}.value`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
        ...(sourceState === undefined ? {} : { interactionState: sourceState }),
      }),
    }];
  }
  const matchStyle = input.style({
    part: 'match',
    base: { ...(base ?? {}), fg: { kind: 'theme', token: 'menu.match' }, underline: true },
    applyDefaultStateStyle: false,
    ...(states.length === 0 ? {} : { states }),
  });
  const spans: RenderSpan[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) spans.push(labelSpan(label.slice(cursor, match.start), false));
    if (match.end > match.start) spans.push(labelSpan(label.slice(match.start, match.end), true));
    cursor = Math.max(cursor, match.end);
  }
  if (cursor < label.length) spans.push(labelSpan(label.slice(cursor), false));
  return spans;

  function labelSpan(text: string, matched: boolean): RenderSpan {
    return {
      text,
      ...(matched
        ? matchStyle === undefined ? {} : { style: matchStyle }
        : base === undefined ? {} : { style: base }),
      source: input.frameSource({
        cellRole: 'text',
        partName: matched ? 'match' : 'item',
        partType: 'text',
        description: `item.${entry.id}.${matched ? 'match' : 'value'}`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
        ...(sourceState === undefined ? {} : { interactionState: sourceState }),
      }),
    };
  }
}

function optionalSpanStyle(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function activeEntry(model: ListboxModel): ListEntryModel | undefined {
  return model.activeId === undefined
    ? undefined
    : model.entries.find((entry) => entry.id === model.activeId);
}

function transition(transition: ListboxTransition): ListboxComponentAction {
  return { kind: 'transition', transition };
}

function activate(entry: ListEntryModel): ListboxComponentAction {
  return { kind: 'activate', event: { kind: 'activate', id: entry.id, itemIndex: entry.itemIndex } };
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return value;
}

function requiredCleanString(value: unknown, subject: string): string {
  const clean = cleanLine(requiredString(value, subject));
  if (clean.trim() === '') throw new TypeError(`${subject} must be non-empty.`);
  return clean;
}

function optionalCleanString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : requiredCleanString(value, subject);
}

function cleanLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
