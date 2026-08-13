import type { AccessibleNode } from '../../accessibility/index.ts';
import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { PointerInteractionAction } from '../../interaction/index.ts';
import { preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
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
  NotificationHistoryAction,
  NotificationRegionAction,
} from '../../ui-model/notification.ts';
import type { NotificationStylePart } from '../../ui-model/style-parts.ts';
import { resolveStableIds } from '../../ui-model/identity.ts';
import { isNotificationTone } from '../../ui-model/status.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { NotificationHistoryOptions, NotificationRegionOptions } from '../options/feedback.ts';

interface NotificationModel {
  readonly items: readonly NotificationItem[];
  readonly placement: NotificationPlacement;
  readonly maxWidth: number;
  readonly selectedId?: string;
  readonly pointerState?: PointerInteractionState;
  readonly dismissActions: boolean;
}

interface NotificationOwnOptions {
  readonly items: readonly NotificationItem[];
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly selectedId?: string;
  readonly pointerState?: PointerInteractionState;
}

type NotificationRegionComponentAction = NotificationRegionAction | {
  readonly kind: 'pointerLifecycle';
  readonly action: PointerInteractionAction;
};

type NotificationHistoryComponentAction = NotificationHistoryAction | {
  readonly kind: 'pointerLifecycle';
  readonly action: PointerInteractionAction;
};

const parts = [
  'background',
  'border',
  'title',
  'message',
  'detail',
  'progress',
  'dismiss',
] as const;

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
  prepare: (value) => prepareNotifications(value, false, false),
  measure: measureNotifications,
  render: paintNotifications,
  accessibility: (input) => accessibleNotifications(input, 'region', false),
});

const activeRegion = defineComponent<
  Omit<NotificationOwnOptions, 'selectedId'>,
  NotificationModel,
  NotificationRegionComponentAction,
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
  prepare: (value) => prepareNotifications(value, false, true),
  measure: measureNotifications,
  render: paintNotifications,
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
  focusTargets: (input) => focusTargets(input, 'region'),
  hitTargets: (input) => hitTargets<NotificationRegionAction>(input, 'region'),
  accessibility: (input) => accessibleNotifications(input, 'region', true),
});

const history = defineComponent<
  NotificationOwnOptions,
  NotificationModel,
  NotificationHistoryComponentAction,
  NotificationStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/notification-history',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'listbox',
  metadata: ['focus', 'layer', 'styles'],
  parts,
  prepare: (value) => prepareNotifications(value, true, true),
  measure: measureNotifications,
  render: paintNotifications,
  keys: ({ model }) => ({
    arrowUp: () => ({ kind: 'move', delta: -1 }),
    arrowDown: () => ({ kind: 'move', delta: 1 }),
    home: () => ({ kind: 'first' }),
    end: () => ({ kind: 'last' }),
    delete: () =>
      model.selectedId === undefined ? ignoreMessage() : { kind: 'remove', id: model.selectedId },
  }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
  focusTargets: (input) => focusTargets(input, 'history'),
  hitTargets: (input) => hitTargets<NotificationHistoryAction>(input, 'history'),
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
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  assertRequiredCallback(options.onAction, 'notificationRegion onAction');
  assertOptionalCallback(options.onPointerAction, 'notificationRegion onPointerAction');
  const { onAction, onPointerAction, ...own } = options;
  return activeRegion({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      onAction: (action) => action.kind === 'pointerLifecycle'
        ? onPointerAction?.(action.action) ?? ignoreMessage()
        : onAction(action),
  });
}

export function notificationHistory<const TMessage extends ComponentMessage = never>(
  options: NotificationHistoryOptions<TMessage>,
): Element<TMessage> {
  assertRequiredCallback(options.onAction, 'notificationHistory onAction');
  assertOptionalCallback(options.onPointerAction, 'notificationHistory onPointerAction');
  const { onAction, onPointerAction, ...own } = options;
  return history({
    ...own,
    id: options.id,
    ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointerAction?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
}

function prepareNotifications(
  value: Readonly<NotificationOwnOptions>,
  acceptsSelection: boolean,
  dismissActions: boolean,
): NotificationModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('notification options must contain an items array.');
  }
  const items = value.items.map(prepareItem);
  resolveStableIds(items, (item) => item.id, 'notifications');
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
  const pointerState = preparePointerInteractionState(
    value.pointerState,
    'notification pointerState',
    dismissActions,
  );
  return {
    items,
    placement: placement ?? 'top-right',
    maxWidth: maxWidth ?? 44,
    dismissActions,
    ...(selectedId === undefined ? {} : { selectedId: clean(selectedId) }),
    ...(pointerState === undefined ? {} : { pointerState }),
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
  readonly bounds: Rect;
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

function placedCards(input: ComponentInput<NotificationModel>): readonly PlacedCard[] {
  const value = cards(input);
  if (value.length === 0 || input.bounds.width <= 0 || input.bounds.height <= 0) return [];
  const requestedWidth = value.reduce((maximum, card) => Math.max(maximum, card.width), 0);
  const requestedHeight = value.reduce(
    (total, card, index) => total + card.height + (index === 0 ? 0 : 1),
    0,
  );
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
    if (bounds.width > 0 && bounds.height >= 3) output.push({ card, bounds });
    row += card.height + 1;
  }
  return output;
}

function paintNotifications(
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
): void {
  for (const placed of placedCards(input)) paintCard(input, placed);
}

function paintCard(
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
  placed: PlacedCard,
): void {
  const { card, bounds } = placed;
  const tone = card.item.tone ?? 'info';
  const selected = card.item.id === input.model.selectedId;
  const state = pointerVisualState(input.model.pointerState, targetId(input.id, card.item.id)) ??
    (selected ? 'selected' : undefined);
  const background = style(input, 'background', tone, false, state, {
    bg: { kind: 'theme', token: selected ? 'selection.background' : backgroundToken(tone) },
  });
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
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
  paintBorder(input, placed, tone, state);
  const contentWidth = Math.max(0, bounds.width - 2);
  const contentHeight = Math.max(0, bounds.height - 2);
  for (const [index, line] of card.lines.slice(0, contentHeight).entries()) {
    input.target.write(
      bounds.row + 1 + index,
      bounds.column + 1,
      clipRenderSpans(
        [
          partSpan(
            input,
            line.text,
            line.part,
            line.part,
            card.item.id,
            style(input, line.part, tone, line.part === 'title', state),
            state,
          ),
        ],
        contentWidth,
        { ellipsis: '…', mode: 'middle', widthProfile: input.widthProfile },
      ),
    );
  }
  if (card.item.progress !== undefined && contentHeight > 0) {
    input.target.write(
      bounds.row + bounds.height - 2,
      bounds.column + 1,
      progressSpans(input, card.item, contentWidth, tone, state),
    );
  }
  if (input.model.dismissActions && card.item.dismissible !== false && bounds.width >= 3) {
    const dismissState =
      pointerVisualState(input.model.pointerState, dismissTargetId(input.id, card.item.id)) ??
        state;
    input.target.write(bounds.row, bounds.column + bounds.width - 2, [
      partSpan(
        input,
        oneCellGlyph('×', 'x', { widthProfile: input.widthProfile }),
        'dismiss',
        'dismiss',
        card.item.id,
        style(input, 'dismiss', tone, false, dismissState),
        dismissState,
      ),
    ]);
  }
}

function paintBorder(
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
  placed: PlacedCard,
  tone: NotificationTone,
  state: ElementVisualState | undefined,
): void {
  const { bounds, card } = placed;
  if (bounds.width < 2 || bounds.height < 2) return;
  const border = style(input, 'border', tone, false, state, {
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
  for (let row = bounds.row + 1; row < bounds.row + bounds.height - 1; row += 1) {
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
  input.target.write(bounds.row + bounds.height - 1, bounds.column, [
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
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
  item: NotificationItem,
  width: number,
  tone: NotificationTone,
  state: ElementVisualState | undefined,
): readonly RenderSpan[] {
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
        style(input, 'progress', tone, true, state, {
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
        style(input, 'progress', tone, false, state, {
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
        style(input, 'progress', tone, false, state),
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
  return placedCards(input).flatMap(({ card, bounds }) => {
    const selection = kind === 'history'
      ? [{
        id: targetId(input.id, card.item.id),
        bounds,
        accepts: ['click' as const],
        cursor: 'pointer' as const,
        message: () => ({ kind: 'select', id: card.item.id }) as TAction,
      }]
      : [];
    if (card.item.dismissible === false || bounds.width < 3) return selection;
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
}

function focusTargets(
  input: ComponentInput<NotificationModel>,
  kind: 'region' | 'history',
): readonly import('../../renderer/index.ts').FocusTarget[] {
  if (kind === 'history') return [{ id: 'self', bounds: input.bounds }];
  return placedCards(input).flatMap(({ card, bounds }) =>
    card.item.dismissible === false || bounds.width < 3 ? [] : [{
      id: dismissTargetId(input.id, card.item.id),
      bounds: { row: bounds.row, column: bounds.column + bounds.width - 2, width: 1, height: 1 },
    }]
  );
}

function accessibleNotifications(
  input: ComponentAccessibilityInput<NotificationModel>,
  kind: 'region' | 'history',
  dismissible: boolean,
): AccessibleNode {
  return {
    id: input.id,
    role: kind === 'history' ? 'listbox' : 'status',
    label: 'Notifications',
    description: `${String(input.model.items.length)} visible notification${
      input.model.items.length === 1 ? '' : 's'
    }.`,
    ...(kind === 'region'
      ? {
        live: input.model.items.some((item) => item.tone === 'error')
          ? 'assertive' as const
          : 'polite' as const,
      }
      : {}),
    scope: { kind: 'popover' },
    ...(input.focused ? { focused: true } : {}),
    children: input.model.items.map((item): AccessibleNode => {
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
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
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
  input: ComponentRenderInput<NotificationModel, NotificationStylePart>,
  part: NotificationStylePart,
  tone: NotificationTone,
  emphasized: boolean,
  state: ElementVisualState | undefined,
  extra?: TerminalStyle,
): TerminalStyle | undefined {
  return input.style({
    part,
    ...(state === undefined ? {} : { state }),
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
