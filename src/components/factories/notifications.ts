import type { AccessibleNode } from '../../accessibility/index.ts';
import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  ComponentScrollbarPlan,
  ComponentStyleInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import {
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import {
  fillTextCells,
  measureTextCells,
  oneCellGlyph,
  sanitizeTerminalText,
} from '../../text/index.ts';
import type { ThemeColorToken } from '../../theme/index.ts';
import type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
} from '../../ui-model/feedback.ts';
import type {
  NotificationHistoryTransition,
  NotificationRegionAction,
} from '../../ui-model/notification.ts';
import type {
  NotificationHistoryStylePart,
  NotificationStylePart,
} from '../../ui-model/style-parts.ts';
import { assertStableIds } from '../../ui-model/identity.ts';
import { isNotificationTone } from '../../ui-model/status.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { NotificationHistoryOptions, NotificationRegionOptions } from '../options/feedback.ts';

interface NotificationModel {
  readonly items: readonly NotificationItem[];
  readonly placement: NotificationPlacement;
  readonly maxWidth: number;
  readonly selectedId?: string;
  readonly showDismissActions: boolean;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

interface NotificationOwnOptions {
  readonly items: readonly NotificationItem[];
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

type NotificationRegionComponentAction = NotificationRegionAction;
type NotificationHistoryComponentAction = NotificationHistoryTransition;

const parts = [
  'background',
  'border',
  'title',
  'message',
  'detail',
  'progress',
  'dismiss',
] as const;
const historyParts = [...parts, 'scrollbarTrack', 'scrollbarThumb'] as const;

const passiveRegion = defineComponent<
  Omit<NotificationOwnOptions, 'selectedId'>,
  NotificationModel,
  never,
  NotificationStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/notification-region',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['focus', 'layer', 'styles'],
  parts,
  visualStates: [],
  prepare: (value) => prepareNotifications(value, false, false),
  measure: measureNotifications,
  render: paintRegionNotifications,
  accessibility: (input) => accessibleNotifications(input, 'region', false),
});

const activeRegion = defineComponent<
  Omit<NotificationOwnOptions, 'selectedId'>,
  NotificationModel,
  NotificationRegionComponentAction,
  NotificationStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['hovered', 'pressed']
>({
  name: 'terminal-ui/components/notification-region',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['focus', 'layer', 'styles'],
  parts,
  visualStates: ['hovered', 'pressed'],
  prepare: (value) => prepareNotifications(value, false, true),
  measure: measureNotifications,
  render: paintRegionNotifications,
  focusTargets: (input) => focusTargets(input, 'region'),
  hitTargets: (input) => hitTargets<NotificationRegionAction>(input, 'region'),
  accessibility: (input) => accessibleNotifications(input, 'region', true),
});

const history = defineComponent<
  NotificationOwnOptions,
  NotificationModel,
  NotificationHistoryComponentAction,
  NotificationHistoryStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['hovered', 'pressed', 'active', 'selected', 'disabled']
>({
  name: 'terminal-ui/components/notification-history',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'listbox',
  metadata: ['focus', 'layer', 'styles'],
  parts: historyParts,
  visualStates: ['hovered', 'pressed', 'active', 'selected', 'disabled'],
  prepare: (value) => prepareNotifications(value, true, true),
  measure: measureNotifications,
  render: paintHistoryNotifications,
  keys: (input) => ({
    arrowUp: () => historySelection(input, -1),
    arrowDown: () => historySelection(input, 1),
    home: () => historySelection(input, 'first'),
    end: () => historySelection(input, 'last'),
    delete: () =>
      input.model.selectedId === undefined
        ? ignoreMessage()
        : { kind: 'remove', id: input.model.selectedId },
  }),
  focusTargets: (input) => focusTargets(input, 'history'),
  hitTargets: (input) => hitTargets<NotificationHistoryTransition>(input, 'history'),
  accessibility: (input) => accessibleNotifications(input, 'history', true),
});

export function notificationRegion<const TMessage extends ComponentMessage = never>(
  options: NotificationRegionOptions<TMessage>,
): Element<TMessage> {
  if (options.onAction === undefined) {
    return passiveRegion({
      items: options.items,
      id: options.id,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.styles === undefined ? {} : { styles: options.styles }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  assertRequiredCallback(options.onAction, 'notificationRegion onAction');
  const { onAction, ...own } = options;
  return activeRegion({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      onAction,
  });
}

export function notificationHistory<const TMessage extends ComponentMessage = never>(
  options: NotificationHistoryOptions<TMessage>,
): Element<TMessage> {
  assertRequiredCallback(options.onAction, 'notificationHistory onAction');
  const { onAction, ...own } = options;
  return history({
    ...own,
    id: options.id,
    ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
    scroll: options.scroll,
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction,
  });
}

function prepareNotifications(
  value: Readonly<NotificationOwnOptions>,
  acceptsSelection: boolean,
  showDismissActions: boolean,
): NotificationModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('notification options must contain an items array.');
  }
  const items = value.items.map(prepareItem);
  assertStableIds(items, (item) => item.id, 'notifications');
  const placement = value.placement;
  assertOptionalEnum(
    placement,
    ['top-right', 'bottom-right', 'centered-stack'],
    'notification placement',
  );
  const maxWidth = value.maxWidth;
  if (
    maxWidth !== undefined &&
    (typeof maxWidth !== 'number' || !Number.isSafeInteger(maxWidth) || maxWidth < 20 ||
      maxWidth > 120)
  ) {
    throw new RangeError('notification maxWidth must be a safe integer from 20 through 120.');
  }
  const selectedId = value.selectedId;
  if (!acceptsSelection && selectedId !== undefined) {
    throw new TypeError('notificationRegion cannot define selectedId.');
  }
  if (selectedId !== undefined && typeof selectedId !== 'string') {
    throw new TypeError('notification selectedId must be a string.');
  }
  const scroll = prepareComponentScrollState(value.scroll, 'notificationHistory scroll');
  if (acceptsSelection && scroll === undefined) {
    throw new TypeError('notificationHistory requires a controlled scroll state.');
  }
  if (!acceptsSelection && value.scroll !== undefined) {
    throw new TypeError('notificationRegion cannot define scroll state.');
  }
  const scrollbar = prepareComponentScrollbarOptions(
    value.scrollbar,
    'notificationHistory scrollbar',
  );
  const scrollPolicy = prepareComponentScrollPolicy(
    value.scrollPolicy,
    'notificationHistory scrollPolicy',
  );
  return {
    items,
    placement: placement ?? 'top-right',
    maxWidth: maxWidth ?? 44,
    showDismissActions,
    ...(selectedId === undefined ? {} : { selectedId: clean(selectedId) }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function prepareItem(value: NotificationItem, index: number): NotificationItem {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`notification items[${String(index)}] must be an object.`);
  }
  const { id, title, message, tone, progress, detail, dismissible } = value;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError(`notification items[${String(index)}].id must be non-empty.`);
  }
  if (typeof title !== 'string') {
    throw new TypeError(`notification items[${String(index)}].title must be a string.`);
  }
  if (message !== undefined && typeof message !== 'string') {
    throw new TypeError(`notification items[${String(index)}].message must be a string.`);
  }
  if (tone !== undefined && !isNotificationTone(tone)) {
    throw new TypeError(`notification items[${String(index)}].tone is invalid.`);
  }
  if (progress !== undefined && (typeof progress !== 'number' || !Number.isFinite(progress))) {
    throw new RangeError(`notification items[${String(index)}].progress must be finite.`);
  }
  if (detail !== undefined && typeof detail !== 'string') {
    throw new TypeError(`notification items[${String(index)}].detail must be a string.`);
  }
  if (dismissible !== undefined && typeof dismissible !== 'boolean') {
    throw new TypeError(`notification items[${String(index)}].dismissible must be boolean.`);
  }
  return {
    id: clean(id),
    title: clean(title),
    ...(message === undefined ? {} : { message: clean(message) }),
    ...(tone === undefined ? {} : { tone }),
    ...(progress === undefined ? {} : { progress }),
    ...(detail === undefined ? {} : { detail: clean(detail) }),
    ...(dismissible === undefined ? {} : { dismissible }),
  };
}


interface Card {
  readonly item: NotificationItem;
  readonly lines: readonly {
    readonly part: 'title' | 'message' | 'detail';
    readonly text: string;
  }[];
  readonly width: number;
  readonly height: number;
}

interface PlacedCard {
  readonly card: Card;
  /** Full card rectangle after applying the controlled scroll offset. */
  readonly bounds: Rect;
  readonly visibleBounds: Rect;
}

interface NotificationLayout {
  readonly cards: readonly PlacedCard[];
  readonly scrollbar?: ComponentScrollbarPlan;
}

function cards(
  input: Pick<ComponentInput<NotificationModel>, 'model' | 'widthProfile'>,
): readonly Card[] {
  return input.model.items.map((item) => {
    const lines = [
      { part: 'title' as const, text: item.title },
      ...(item.message === undefined ? [] : [{ part: 'message' as const, text: item.message }]),
      ...(item.detail === undefined || item.detail === ''
        ? []
        : [{ part: 'detail' as const, text: item.detail }]),
    ];
    const contentWidth = lines.reduce(
      (maximum, line) =>
        Math.max(maximum, measureTextCells(line.text, { widthProfile: input.widthProfile }).cells),
      0,
    );
    return {
      item,
      lines,
      width: Math.max(20, Math.min(input.model.maxWidth, contentWidth + 2)),
      height: Math.max(3, lines.length + 2 + (item.progress === undefined ? 0 : 1)),
    };
  });
}

function measureNotifications(input: ComponentMeasureInput<NotificationModel>) {
  const value = cards(input);
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: value.reduce((maximum, card) => Math.max(maximum, card.width), 0),
    preferredHeight: value.reduce(
      (total, card, index) => total + card.height + (index === 0 ? 0 : 1),
      0,
    ),
  };
}

function notificationLayout(input: ComponentInput<NotificationModel>): NotificationLayout {
  const value = cards(input);
  if (value.length === 0 || input.bounds.width <= 0 || input.bounds.height <= 0) {
    return { cards: [] };
  }
  if (input.model.scroll !== undefined) return historyLayout(input, value);
  const requestedWidth = value.reduce((maximum, card) => Math.max(maximum, card.width), 0);
  const requestedHeight = cardRows(value);
  const area = {
    row: Math.min(1, input.bounds.height),
    column: Math.min(1, input.bounds.width),
    width: Math.max(0, input.bounds.width - 2),
    height: Math.max(0, input.bounds.height - 2),
  };
  const width = Math.min(requestedWidth, area.width);
  const height = Math.min(requestedHeight, area.height);
  const stack = {
    row: input.model.placement === 'bottom-right'
      ? area.row + area.height - height
      : input.model.placement === 'centered-stack'
      ? area.row + Math.floor((area.height - height) / 2)
      : area.row,
    column: input.model.placement === 'centered-stack'
      ? area.column + Math.floor((area.width - width) / 2)
      : area.column + area.width - width,
    width,
    height,
  };
  const output: PlacedCard[] = [];
  let row = stack.row;
  for (const card of value) {
    const remaining = stack.row + stack.height - row;
    if (remaining < 3) break;
    const bounds = {
      row,
      column: stack.column + Math.max(0, stack.width - card.width),
      width: Math.min(card.width, stack.width),
      height: Math.min(card.height, remaining),
    };
    if (bounds.width > 0 && bounds.height >= 3) {
      output.push({ card, bounds, visibleBounds: bounds });
    }
    row += card.height + 1;
  }
  return { cards: output };
}

function historyLayout(
  input: ComponentInput<NotificationModel>,
  value: readonly Card[],
): NotificationLayout {
  const scroll = input.model.scroll;
  if (scroll === undefined) {
    throw new Error('Notification history requires controlled scroll state.');
  }
  const scrollbar = prepareComponentScrollbar({
    bounds: input.bounds,
    scroll,
    contentRows: cardRows(value),
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
  const viewport = scrollbar.contentBounds;
  const output: PlacedCard[] = [];
  let logicalRow = 0;
  for (const card of value) {
    const bounds = {
      row: viewport.row + logicalRow - scrollbar.scroll.offsetRow,
      column: viewport.column + Math.max(0, viewport.width - Math.min(card.width, viewport.width)),
      width: Math.min(card.width, viewport.width),
      height: card.height,
    };
    const visibleBounds = intersect(bounds, viewport);
    if (visibleBounds !== undefined) output.push({ card, bounds, visibleBounds });
    logicalRow += card.height + 1;
  }
  return { cards: output, scrollbar };
}

function cardRows(value: readonly Card[]): number {
  return value.reduce(
    (total, card, index) => total + card.height + (index === 0 ? 0 : 1),
    0,
  );
}

function historySelection(
  input: ComponentInput<NotificationModel>,
  direction: -1 | 1 | 'first' | 'last',
): import('../../interaction/message.ts').MessageResolution<NotificationHistoryTransition> {
  const value = cards(input);
  if (value.length === 0) return ignoreMessage();
  const current = input.model.selectedId === undefined
    ? -1
    : value.findIndex((card) => card.item.id === input.model.selectedId);
  const index = direction === 'first'
    ? 0
    : direction === 'last'
    ? value.length - 1
    : current < 0
    ? direction < 0 ? value.length - 1 : 0
    : Math.max(0, Math.min(value.length - 1, current + direction));
  const selected = value[index];
  if (selected === undefined) return ignoreMessage();
  const layout = notificationLayout(input);
  const plan = layout.scrollbar;
  if (plan === undefined) return ignoreMessage();
  let startRow = 0;
  for (let itemIndex = 0; itemIndex < index; itemIndex += 1) {
    startRow += (value[itemIndex]?.height ?? 0) + 1;
  }
  const endRow = startRow + selected.height;
  const viewportEnd = plan.scroll.offsetRow + plan.geometry.viewportRows;
  const offsetRow = startRow < plan.scroll.offsetRow
    ? startRow
    : endRow > viewportEnd
    ? Math.max(0, endRow - plan.geometry.viewportRows)
    : plan.scroll.offsetRow;
  return {
    kind: 'selection',
    selectedId: selected.item.id,
    scroll: {
      ...plan.scroll,
      offsetRow,
      followTail: false,
    },
  };
}

function intersect(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const endRow = Math.min(left.row + left.height, right.row + right.height);
  const endColumn = Math.min(left.column + left.width, right.column + right.width);
  return endRow <= row || endColumn <= column
    ? undefined
    : { row, column, width: endColumn - column, height: endRow - row };
}

type NotificationPaintInput = Omit<
  ComponentRenderInput<NotificationModel, NotificationStylePart>,
  'style'
> & {
  readonly style: (
    input: ComponentStyleInput<NotificationStylePart>
  ) => TerminalStyle | undefined;
};

function paintRegionNotifications(
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
): void {
  const layout = notificationLayout(input);
  for (const placed of layout.cards) paintCard(input, placed);
}

function paintHistoryNotifications(
  input: ComponentRenderInput<NotificationModel, NotificationHistoryStylePart>,
): void {
  const layout = notificationLayout(input);
  for (const placed of layout.cards) paintCard(input, placed);
  if (layout.scrollbar !== undefined) {
    paintComponentScrollbar({
      target: input.target,
      plan: layout.scrollbar,
      theme: input.theme,
      style: (part, state, base) => input.style({
        part,
        base,
        ...(state === undefined ? {} : { states: [state] }),
      }),
      source: (sourceInput) => input.source(sourceInput),
    });
  }
}

function paintCard(
  input: NotificationPaintInput,
  placed: PlacedCard,
): void {
  const { card, bounds } = placed;
  const tone = card.item.tone ?? 'info';
  const selected = card.item.id === input.model.selectedId;
  const pointer = pointerVisualState(input.pointerState, targetId(input.id, card.item.id));
  const states = [
    ...(selected ? ['selected' as const] : []),
    ...(pointer === undefined ? [] : [pointer]),
  ];
  const state = states.at(-1);
  const background = style(input, 'background', tone, false, states, {
    bg: { kind: 'theme', token: selected ? 'selection.background' : backgroundToken(tone) },
  });
  for (
    let row = placed.visibleBounds.row;
    row < placed.visibleBounds.row + placed.visibleBounds.height;
    row += 1
  ) {
    input.target.write(row, bounds.column, [
      partSpan(
        input,
        ' '.repeat(bounds.width),
        'background',
        'background',
        card.item.id,
        background,
        state,
        'decoration',
      ),
    ]);
  }
  paintBorder(input, placed, tone, states);
  const contentWidth = Math.max(0, bounds.width - 2);
  const contentHeight = Math.max(0, bounds.height - 2);
  for (const [index, line] of card.lines.slice(0, contentHeight).entries()) {
    const row = bounds.row + 1 + index;
    if (row < placed.visibleBounds.row || row >= placed.visibleBounds.row + placed.visibleBounds.height) {
      continue;
    }
    input.target.write(
      row,
      bounds.column + 1,
      clipRenderSpans(
        [
          partSpan(
            input,
            line.text,
            line.part,
            line.part,
            card.item.id,
            style(input, line.part, tone, line.part === 'title', states),
            state,
          ),
        ],
        contentWidth,
        { ellipsis: '…', mode: 'middle', widthProfile: input.widthProfile },
      ),
    );
  }
  const progressRow = bounds.row + bounds.height - 2;
  if (
    card.item.progress !== undefined &&
    contentHeight > 0 &&
    progressRow >= placed.visibleBounds.row &&
    progressRow < placed.visibleBounds.row + placed.visibleBounds.height
  ) {
    input.target.write(
      progressRow,
      bounds.column + 1,
      progressSpans(input, card.item, contentWidth, tone, states),
    );
  }
  if (
    input.model.showDismissActions &&
    card.item.dismissible !== false &&
    bounds.width >= 3 &&
    bounds.row >= placed.visibleBounds.row &&
    bounds.row < placed.visibleBounds.row + placed.visibleBounds.height
  ) {
    const dismissPointer = pointerVisualState(
      input.pointerState,
      dismissTargetId(input.id, card.item.id),
    );
    const dismissStates = [
      ...states,
      ...(dismissPointer === undefined ? [] : [dismissPointer]),
    ];
    const dismissState = dismissStates.at(-1);
    input.target.write(bounds.row, bounds.column + bounds.width - 2, [
      partSpan(
        input,
        oneCellGlyph('×', 'x', { widthProfile: input.widthProfile }),
        'dismiss',
        'dismiss',
        card.item.id,
        style(input, 'dismiss', tone, false, dismissStates),
        dismissState,
      ),
    ]);
  }
}

function paintBorder(
  input: NotificationPaintInput,
  placed: PlacedCard,
  tone: NotificationTone,
  states: readonly Exclude<ElementVisualState, 'default'>[],
): void {
  const { bounds, card } = placed;
  if (bounds.width < 2 || bounds.height < 2) return;
  const state = states.at(-1);
  const border = style(input, 'border', tone, false, states, {
    fg: { kind: 'theme', token: borderToken(tone) },
  });
  const glyph = (unicode: string, ascii: string) =>
    oneCellGlyph(unicode, ascii, { widthProfile: input.widthProfile });
  const title = `${
    card.item.id === input.model.selectedId ? `${input.theme.tokens.symbols.pointer} ` : ''
  }${tone}`;
  const inner = Math.max(0, bounds.width - 2);
  const titleSpans = clipRenderSpans([span(` ${title} `)], inner, {
    widthProfile: input.widthProfile,
    ellipsis: '…',
  });
  const titleWidth = measureRenderSpans(titleSpans, { widthProfile: input.widthProfile });
  if (bounds.row >= placed.visibleBounds.row) {
    input.target.write(bounds.row, bounds.column, [
      partSpan(
        input,
        glyph('╭', '+'),
        'border',
        'border.topLeft',
        card.item.id,
        border,
        state,
        'decoration',
      ),
      ...titleSpans.map((current) =>
        partSpan(input, current.text, 'border', 'border.title', card.item.id, border, state)
      ),
      partSpan(
        input,
        glyph('─', '-').repeat(Math.max(0, inner - titleWidth)),
        'border',
        'border.top',
        card.item.id,
        border,
        state,
        'decoration',
      ),
      partSpan(
        input,
        glyph('╮', '+'),
        'border',
        'border.topRight',
        card.item.id,
        border,
        state,
        'decoration',
      ),
    ]);
  }
  const firstMiddle = Math.max(bounds.row + 1, placed.visibleBounds.row);
  const lastMiddle = Math.min(
    bounds.row + bounds.height - 1,
    placed.visibleBounds.row + placed.visibleBounds.height,
  );
  for (let row = firstMiddle; row < lastMiddle; row += 1) {
    input.target.write(row, bounds.column, [
      partSpan(
        input,
        glyph('│', '|'),
        'border',
        'border.left',
        card.item.id,
        border,
        state,
        'decoration',
      ),
    ]);
    input.target.write(row, bounds.column + bounds.width - 1, [
      partSpan(
        input,
        glyph('│', '|'),
        'border',
        'border.right',
        card.item.id,
        border,
        state,
        'decoration',
      ),
    ]);
  }
  const bottomRow = bounds.row + bounds.height - 1;
  if (bottomRow >= placed.visibleBounds.row + placed.visibleBounds.height) return;
  input.target.write(bottomRow, bounds.column, [
    partSpan(
      input,
      glyph('╰', '+'),
      'border',
      'border.bottomLeft',
      card.item.id,
      border,
      state,
      'decoration',
    ),
    partSpan(
      input,
      glyph('─', '-').repeat(inner),
      'border',
      'border.bottom',
      card.item.id,
      border,
      state,
      'decoration',
    ),
    partSpan(
      input,
      glyph('╯', '+'),
      'border',
      'border.bottomRight',
      card.item.id,
      border,
      state,
      'decoration',
    ),
  ]);
}

function progressSpans(
  input: NotificationPaintInput,
  item: NotificationItem,
  width: number,
  tone: NotificationTone,
  states: readonly Exclude<ElementVisualState, 'default'>[],
): readonly RenderSpan[] {
  const state = states.at(-1);
  const progress = Math.max(0, Math.min(100, Math.round(item.progress ?? 0)));
  const barWidth = Math.max(1, Math.min(width - 6, 18));
  const filled = Math.round(progress / 100 * barWidth);
  return clipRenderSpans(
    [
      partSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressFilled, filled, {
          widthProfile: input.widthProfile,
        }),
        'progress',
        'progress.filled',
        item.id,
        style(input, 'progress', tone, true, states, {
          fg: { kind: 'theme', token: foregroundToken(tone) },
          bold: true,
        }),
        state,
        'decoration',
      ),
      partSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressEmpty, barWidth - filled, {
          widthProfile: input.widthProfile,
        }),
        'progress',
        'progress.empty',
        item.id,
        style(input, 'progress', tone, false, states, {
          fg: { kind: 'theme', token: 'text.muted' },
        }),
        state,
        'decoration',
      ),
      partSpan(
        input,
        ` ${String(progress)}%`,
        'progress',
        'progress.value',
        item.id,
        style(input, 'progress', tone, false, states),
        state,
      ),
    ],
    width,
    { widthProfile: input.widthProfile },
  );
}

function hitTargets<TAction>(
  input: ComponentInput<NotificationModel>,
  kind: 'region' | 'history',
): readonly import('../../renderer/index.ts').HitTarget<TAction>[] {
  const layout = notificationLayout(input);
  const historyScroll = kind === 'history'
    ? layout.scrollbar?.scroll
    : undefined;
  if (kind === 'history' && historyScroll === undefined) {
    throw new Error('Notification history layout requires a scrollbar plan.');
  }
  const cards = layout.cards.flatMap(({ card, bounds, visibleBounds }) => {
    const selection = kind === 'history'
      ? [{
        id: targetId(input.id, card.item.id),
        bounds: visibleBounds,
        accepts: ['click' as const],
        cursor: 'pointer' as const,
        message: () => ({
          kind: 'selection',
          selectedId: card.item.id,
          scroll: historyScroll,
        }) as TAction,
      }]
      : [];
    if (
      card.item.dismissible === false ||
      bounds.width < 3 ||
      bounds.row < visibleBounds.row ||
      bounds.row >= visibleBounds.row + visibleBounds.height
    ) return selection;
    return [...selection, {
      id: dismissTargetId(input.id, card.item.id),
      bounds: { row: bounds.row, column: bounds.column + bounds.width - 2, width: 1, height: 1 },
      accepts: ['click' as const],
      cursor: 'pointer' as const,
      message: () =>
        (kind === 'history'
          ? { kind: 'remove', id: card.item.id }
          : { kind: 'dismiss', id: card.item.id }) as TAction,
    }];
  });
  if (kind !== 'history' || layout.scrollbar === undefined) return cards;
  if (input.id === undefined) {
    throw new Error('notificationHistory requires the component identity guaranteed by its definition.');
  }
  return [
    ...cards,
    ...componentScrollbarHitTargets<TAction>({
      id: input.id,
      plan: layout.scrollbar,
      ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
      onScroll: (event) => ({ kind: 'scroll', scroll: event.nextState }) as TAction,
    }),
  ];
}

function focusTargets(
  input: ComponentInput<NotificationModel>,
  kind: 'region' | 'history',
): readonly import('../../renderer/index.ts').FocusTarget[] {
  if (kind === 'history') return [{ id: 'self', bounds: input.bounds }];
  return notificationLayout(input).cards.flatMap(({ card, bounds, visibleBounds }) =>
    card.item.dismissible === false ||
      bounds.width < 3 ||
      bounds.row < visibleBounds.row ||
      bounds.row >= visibleBounds.row + visibleBounds.height
      ? []
      : [{
      id: dismissTargetId(input.id, card.item.id),
      bounds: {
        row: bounds.row,
        column: bounds.column + bounds.width - 2,
        width: 1,
        height: 1,
      },
    }]
  );
}

function accessibleNotifications(
  input: ComponentAccessibilityInput<NotificationModel>,
  kind: 'region' | 'history',
  dismissible: boolean,
): AccessibleNode {
  const visibleItems = notificationLayout(input).cards.map(({ card }) => card.item);
  return {
    id: input.id,
    role: kind === 'history' ? 'listbox' : 'status',
    label: 'Notifications',
    description: kind === 'history'
      ? `${String(visibleItems.length)} of ${String(input.model.items.length)} notifications visible.`
      : `${String(visibleItems.length)} active notification${visibleItems.length === 1 ? '' : 's'} visible.`,
    ...(kind === 'region'
      ? {
        live: input.model.items.some((item) => item.tone === 'error')
          ? 'assertive' as const
          : 'polite' as const,
      }
      : {}),
    scope: { kind: 'popover' },
    ...(input.focused ? { focused: true } : {}),
    ...(kind === 'history' && input.model.selectedId !== undefined && visibleItems.some(
      (item) => item.id === input.model.selectedId,
    ) ? { activeDescendant: `${input.id}:notification:${input.model.selectedId}` } : {}),
    children: visibleItems.map((item): AccessibleNode => {
      const itemDescription = description(item);
      return {
        id: `${input.id}:notification:${item.id}`,
        role: kind === 'history' ? 'option' : 'status',
        label: item.title,
        ...(kind === 'history' ? { selected: item.id === input.model.selectedId } : {}),
        ...(itemDescription === undefined ? {} : { description: itemDescription }),
        ...(kind === 'region'
          ? { live: item.tone === 'error' ? 'assertive' as const : 'polite' as const }
          : {}),
        children: [
          ...(item.progress === undefined ? [] : [{
            id: `${input.id}:notification:${item.id}:progress`,
            role: 'progressbar' as const,
            label: `${item.title} progress`,
            numericValue: {
              current: Math.max(0, Math.min(100, item.progress)),
              minimum: 0,
              maximum: 100,
            },
          }]),
          ...(!dismissible || item.dismissible === false ? [] : [{
            id: dismissTargetId(input.id, item.id),
            role: 'button' as const,
            label: `Dismiss ${item.title}`,
            ...(input.focusedTargetId === dismissTargetId(input.id, item.id)
              ? { focused: true }
              : {}),
          }]),
        ],
      };
    }),
  };
}

function description(item: NotificationItem): string | undefined {
  const value = [item.message, item.detail].filter((part): part is string =>
    part !== undefined && part.length > 0
  ).join(' ');
  return value === '' ? undefined : value;
}

function partSpan(
  input: NotificationPaintInput,
  text: string,
  part: NotificationStylePart,
  partName: string,
  itemId: string,
  value: TerminalStyle | undefined,
  state: ElementVisualState | undefined,
  cellRole: import('../../visual/source.ts').FrameCellRole = 'text',
): RenderSpan {
  return span(text, {
    ...(value === undefined ? {} : { style: value }),
    source: input.source({
      cellRole,
      partName,
      partType: part,
      itemId,
      ...(state === undefined || state === 'default' ? {} : { interactionState: state }),
    }),
  });
}

function style(
  input: NotificationPaintInput,
  part: NotificationStylePart,
  tone: NotificationTone,
  emphasized: boolean,
  states: readonly Exclude<ElementVisualState, 'default'>[],
  extra?: TerminalStyle,
): TerminalStyle | undefined {
  const state = states.at(-1);
  return input.style({
    part,
    ...(states.length === 0 ? {} : { states }),
    base: {
      fg: { kind: 'theme', token: emphasized ? foregroundToken(tone) : 'text.default' },
      ...(state === 'selected' || state === 'hovered' || state === 'pressed'
        ? { bg: { kind: 'theme', token: 'selection.background' as const } }
        : {}),
      ...(emphasized || tone === 'error' || tone === 'success' ? { bold: true } : {}),
      ...extra,
    },
  });
}

function backgroundToken(tone: NotificationTone): ThemeColorToken {
  if (tone === 'success') return 'surface.success.background';
  if (tone === 'warning') return 'surface.warning.background';
  if (tone === 'error') return 'surface.danger.background';
  return 'surface.selected.background';
}
function borderToken(tone: NotificationTone): ThemeColorToken {
  if (tone === 'success') return 'surface.success.border';
  if (tone === 'warning') return 'surface.warning.border';
  if (tone === 'error') return 'surface.danger.border';
  return 'surface.selected.border';
}
function foregroundToken(tone: NotificationTone): ThemeColorToken {
  if (tone === 'success') return 'status.success';
  if (tone === 'warning') return 'status.warning';
  if (tone === 'error') return 'status.error';
  if (tone === 'progress') return 'status.running';
  return 'status.info';
}

function targetId(id: string | undefined, itemId: string): string {
  return `${id ?? 'notifications'}:notification:${itemId}`;
}
function dismissTargetId(id: string | undefined, itemId: string): string {
  return `${targetId(id, itemId)}:dismiss`;
}
function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
