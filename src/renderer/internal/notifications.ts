import type { RenderNodeOfKind } from '../model/index.ts';
import { measureTextCells } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import { drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { RenderTarget } from '../model/render-target.ts';
import { renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../model/layout.ts';
import { clipRenderSpans } from '../../visual/render.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { numberProp } from './render-node-props.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { TerminalTheme, ThemeColorToken } from '../../theme/index.ts';
import { normalizeNotificationTone, statusFromTone } from '../../ui-model/status.ts';
import type { NotificationItem, NotificationPlacement, NotificationTone } from '../../ui-model/feedback.ts';
import type { NotificationStackAction } from '../../ui-model/notification-stack.ts';
import { feedbackSpan } from './feedback-visual.ts';
import { statusToken } from './status-visual.ts';
import { mergeStyles } from './render-node-style.ts';
import {
  placeNotificationStack,
  type NotificationStackSize
} from './notifications/placement.ts';

export { placeNotificationStack } from './notifications/placement.ts';
export type { NotificationStackPlacementInput, NotificationStackSize } from './notifications/placement.ts';

const MIN_NOTIFICATION_CARD_HEIGHT = 3;

interface NotificationCard {
  readonly item: NotificationItem;
  readonly selected: boolean;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly NotificationCardLine[];
}

interface NotificationCardLine {
  readonly kind: 'title' | 'message' | 'meta';
  readonly text: string;
}

export function renderNotificationStack(
  widget: NotificationStackNode,
  buffer: RenderTarget,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const cards = notificationCards(widget);
  if (cards.length === 0) return;
  for (const placement of notificationCardPlacements(widget, bounds, cards)) {
    renderNotificationCard(widget, placement.card, buffer, placement.bounds, theme);
  }
}

export function notificationStackPreferredSize(widget: NotificationStackNode): NotificationStackSize {
  return notificationStackSizeFromCards(notificationCards(widget));
}

export function notificationStackAccessibleBase(widget: NotificationStackNode, id: string, focused: boolean): AccessibleNode {
  const items = notificationItems(widget);
  const selected = notificationSelectedId(widget);
  return {
    id,
    role: 'status',
    label: 'Notifications',
    description: `${String(items.length)} visible notification${items.length === 1 ? '' : 's'}.`,
    live: items.some((item) => item.tone === 'error') ? 'assertive' : 'polite',
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {}),
    children: items.map((item): AccessibleNode => {
      const description = notificationDescription(item);
      return {
        id: `${id}:notification:${item.id}`,
        role: 'status',
        label: item.title,
        selected: item.id === selected,
        ...(description === undefined ? {} : { description }),
        ...(item.progress === undefined ? {} : { progress: { value: clampProgress(item.progress), max: 100 } }),
        live: item.tone === 'error' ? 'assertive' : 'polite'
      };
    })
  };
}

export function notificationStackHitTargets<TMessage>(widget: NotificationStackNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toActionMessage = notificationActionMessageFactory(widget);
  if (toActionMessage === undefined) return [];
  return notificationCardPlacements(widget, bounds).flatMap((placement): readonly HitTarget<TMessage>[] => {
    const id = `${widget.id ?? 'notificationStack'}:notification:${placement.card.item.id}`;
    const select: HitTarget<TMessage> = {
      id,
      bounds: placement.bounds,
      accepts: ['click'],
      cursor: 'pointer',
      message: () => toActionMessage({ kind: 'select', id: placement.card.item.id })
    };
    if (placement.card.item.dismissible === false || placement.bounds.width < 3) return [select];
    return [select, {
      id: `${id}:dismiss`,
      bounds: {
        row: placement.bounds.row,
        column: placement.bounds.column + placement.bounds.width - 2,
        width: 1,
        height: 1
      },
      accepts: ['click'],
      cursor: 'pointer',
      message: () => toActionMessage({ kind: 'dismiss', id: placement.card.item.id })
    }];
  });
}

function notificationCardPlacements(widget: NotificationStackNode, bounds: Rect, cards: readonly NotificationCard[] = notificationCards(widget)): readonly {
  readonly card: NotificationCard;
  readonly bounds: Rect;
}[] {
  if (bounds.width <= 0 || bounds.height <= 0 || cards.length === 0) return [];
  const size = notificationStackSizeFromCards(cards);
  const stack = placeNotificationStack({
    viewport: bounds,
    size,
    placement: notificationPlacement(widget),
    margin: 1
  });
  const placements: { readonly card: NotificationCard; readonly bounds: Rect }[] = [];
  let row = stack.row;
  for (const card of cards) {
    if (row > stack.row + stack.height - 1) break;
    const remainingHeight = stack.row + stack.height - row;
    if (remainingHeight < MIN_NOTIFICATION_CARD_HEIGHT) break;
    const cardBounds = {
      row,
      column: stack.column + Math.max(0, stack.width - card.width),
      width: Math.min(card.width, stack.width),
      height: Math.min(card.height, remainingHeight)
    };
    if (cardBounds.width > 0 && cardBounds.height >= MIN_NOTIFICATION_CARD_HEIGHT) {
      placements.push({ card, bounds: cardBounds });
    }
    row += card.height + 1;
  }
  return placements;
}

function renderNotificationCard(
  widget: NotificationStackNode,
  card: NotificationCard,
  buffer: RenderTarget,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = normalizeNotificationTone(card.item.tone);
  fillCardBackground(buffer, widget, bounds, card.item, tone, card.selected);
  drawBorder(buffer, bounds, notificationBorder(widget, card, tone, theme), theme);
  if (card.item.dismissible !== false && bounds.width >= 3) {
    buffer.write(bounds.row, bounds.column + bounds.width - 2, [{
      text: '×',
      style: notificationPartStyle(widget, 'dismiss', tone, false, card.selected),
      source: renderNodeFrameSource(widget, {
        family: 'feedback',
        role: 'text',
        part: 'dismiss',
        partKind: 'notification',
        itemId: card.item.id,
        state: card.selected ? `selected.${tone}` : tone,
        label: 'dismiss'
      })
    }]);
  }
  const contentBounds = {
    row: bounds.row + 1,
    column: bounds.column + 1,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 2)
  };
  for (let index = 0; index < Math.min(card.lines.length, contentBounds.height); index += 1) {
    const cardLine = card.lines[index] ?? { kind: 'message', text: '' };
    const source = renderNodeFrameSource(widget, {
        family: 'feedback',
        role: 'text',
        part: cardLine.kind,
        partKind: 'notification',
        itemId: card.item.id,
        state: card.selected ? `selected.${tone}` : tone,
        label: cardLine.kind
    });
    buffer.write(contentBounds.row + index, contentBounds.column, clipRenderSpans([{
      text: cardLine.text,
      style: notificationPartStyle(widget, cardLine.kind === 'meta' ? 'detail' : cardLine.kind, tone, index === 0, card.selected),
      source
    }], contentBounds.width, {
      ellipsis: '…',
      mode: 'middle'
    }));
  }
  if (card.item.progress !== undefined && contentBounds.height > 0) {
    const progressRow = contentBounds.row + contentBounds.height - 1;
    buffer.write(progressRow, contentBounds.column, progressSpans(widget, card.item, contentBounds.width, tone, theme, card.selected));
  }
}

function notificationCards(widget: NotificationStackNode): readonly NotificationCard[] {
  const maxWidth = notificationMaxWidth(widget);
  const selected = notificationSelectedId(widget);
  return notificationItems(widget).map((item) => {
    const lines = cardContentLines(item);
    const contentWidth = lines.reduce((max, line) => Math.max(max, measureTextCells(line.text).cells), 0);
    const titleWidth = measureTextCells(` ${item.title} `).cells;
    const progressWidth = item.progress === undefined ? 0 : Math.min(maxWidth - 2, 22);
    const width = Math.max(20, Math.min(maxWidth, Math.max(contentWidth, titleWidth, progressWidth) + 2));
    const height = Math.max(3, lines.length + 2 + (item.progress === undefined ? 0 : 1));
    return { item, selected: item.id === selected, width, height, lines };
  });
}

function notificationStackSizeFromCards(cards: readonly NotificationCard[]): NotificationStackSize {
  if (cards.length === 0) return { width: 0, height: 0 };
  return {
    width: cards.reduce((max, card) => Math.max(max, card.width), 0),
    height: cards.reduce((sum, card, index) => sum + card.height + (index === 0 ? 0 : 1), 0)
  };
}

function notificationItems(widget: NotificationStackNode): readonly NotificationItem[] {
  const items = Array.isArray(widget.props.items) ? widget.props.items : [];
  return items.filter(isNotificationItem);
}

function cardContentLines(item: NotificationItem): readonly NotificationCardLine[] {
  return [
    { kind: 'title', text: item.title },
    ...(item.message === undefined ? [] : [{ kind: 'message' as const, text: item.message }]),
    ...notificationMetaLines(item).map((text): NotificationCardLine => ({ kind: 'meta', text }))
  ];
}

function fillCardBackground(
  buffer: RenderTarget,
  widget: NotificationStackNode,
  bounds: Rect,
  item: NotificationItem,
  tone: NotificationTone,
  selected: boolean
): void {
  const style = notificationPartStyle(widget, 'background', tone, false, selected, {
    bg: { kind: 'theme', token: selected ? 'selection.background' : backgroundToken(tone) }
  });
  const line = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: line,
      style,
      source: renderNodeFrameSource(widget, {
        family: 'feedback',
        role: 'decoration',
        part: 'background',
        itemId: item.id,
        state: selected ? `selected.${tone}` : tone,
        label: 'background'
      })
    }]);
  }
}

function progressSpans(
  widget: NotificationStackNode,
  item: NotificationItem,
  width: number,
  tone: NotificationTone,
  theme: TerminalTheme,
  selected: boolean
): readonly RenderSpan[] {
  const progress = clampProgress(item.progress ?? 0);
  const barWidth = Math.max(1, Math.min(width - 6, 18));
  const filled = Math.round((progress / 100) * barWidth);
  return [
    feedbackSpan(widget, theme.tokens.symbols.progressFilled.repeat(filled), {
      kind: 'notification',
      label: 'progress.filled',
      sourceId: item.id,
      role: 'decoration',
      style: notificationPartStyle(widget, 'progress', tone, true, selected, {
        fg: { kind: 'theme', token: foregroundToken(tone) },
        bold: true
      }),
      state: tone
    }),
    feedbackSpan(widget, theme.tokens.symbols.progressEmpty.repeat(barWidth - filled), {
      kind: 'notification',
      label: 'progress.empty',
      sourceId: item.id,
      role: 'decoration',
      style: notificationPartStyle(widget, 'progress', tone, false, selected, {
        fg: { kind: 'theme', token: 'text.muted' }
      }),
      state: tone
    }),
    feedbackSpan(widget, ` ${String(progress)}%`, {
      kind: 'notification',
      label: 'progress.value',
      sourceId: item.id,
      style: notificationPartStyle(widget, 'progress', tone, false, selected),
      state: selected ? `selected.${tone}` : tone
    })
  ];
}

function notificationBorder(
  widget: NotificationStackNode,
  card: NotificationCard,
  tone: NotificationTone,
  theme: TerminalTheme
): BorderStyle {
  return {
    kind: 'rounded',
    title: notificationTitle(card, tone, theme),
    style: notificationPartStyle(widget, 'border', tone, false, card.selected, {
      fg: { kind: 'theme', token: card.selected ? 'selection.foreground' : borderToken(tone) }
    })
  };
}

function notificationTitle(card: NotificationCard, tone: NotificationTone, theme: TerminalTheme): string {
  const marker = card.selected ? `${theme.tokens.symbols.pointer} ` : '';
  return `${marker}${toneLabel(tone)}`;
}

function toneLabel(tone: NotificationTone): string {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'progress':
      return 'progress';
    case 'info':
      return 'info';
  }
}

function notificationPartStyle(
  widget: NotificationStackNode,
  part: 'background' | 'border' | 'detail' | 'dismiss' | 'message' | 'progress' | 'title',
  tone: NotificationTone,
  emphasized: boolean,
  selected: boolean,
  base?: TerminalStyle
): TerminalStyle {
  const toneState = tone === 'progress' ? 'active' : tone === 'info' ? undefined : tone;
  return mergeStyles({
    fg: { kind: 'theme', token: emphasized ? foregroundToken(tone) : 'text.default' },
    ...(selected ? { bg: { kind: 'theme', token: 'selection.background' } } : {}),
    bold: emphasized || tone === 'error' || tone === 'success'
  }, base, widget.styles?.parts?.[part], toneState === undefined ? undefined : widget.styles?.states?.[toneState], selected ? widget.styles?.states?.selected : undefined) ?? {};
}

function backgroundToken(tone: NotificationTone): ThemeColorToken {
  switch (tone) {
    case 'success':
      return 'surface.success.background';
    case 'warning':
      return 'surface.warning.background';
    case 'error':
      return 'surface.danger.background';
    case 'progress':
    case 'info':
      return 'surface.selected.background';
  }
}

function borderToken(tone: NotificationTone): ThemeColorToken {
  switch (tone) {
    case 'success':
      return 'surface.success.border';
    case 'warning':
      return 'surface.warning.border';
    case 'error':
      return 'surface.danger.border';
    case 'progress':
    case 'info':
      return 'surface.selected.border';
  }
}

function foregroundToken(tone: NotificationTone): ThemeColorToken {
  return statusToken(statusFromTone(tone));
}

function notificationPlacement(widget: NotificationStackNode): NotificationPlacement {
  const placement = widget.props.placement;
  return placement === 'bottom-right' || placement === 'centered-stack' ? placement : 'top-right';
}

function notificationMaxWidth(widget: NotificationStackNode): number {
  const value = numberProp(widget, 'maxWidth');
  return value === undefined ? 44 : Math.max(20, Math.min(120, Math.floor(value)));
}

function notificationSelectedId(widget: NotificationStackNode): string | undefined {
  return typeof widget.props.selected === 'string' ? widget.props.selected : undefined;
}

function notificationActionMessageFactory<TMessage>(widget: NotificationStackNode<TMessage>): ((action: NotificationStackAction) => TMessage) | undefined {
  const candidate = widget.props.toActionMessage;
  return typeof candidate === 'function' ? candidate : undefined;
}

function isNotificationItem(value: unknown): value is NotificationItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['id'] === 'string' && typeof candidate['title'] === 'string';
}

function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function notificationMetaLines(item: NotificationItem): readonly string[] {
  return item.detail === undefined || item.detail.length === 0 ? [] : [item.detail];
}

function notificationDescription(item: NotificationItem): string | undefined {
  const parts = [
    item.message,
    ...notificationMetaLines(item)
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length === 0 ? undefined : parts.join(' ');
}

type NotificationStackNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'notificationStack'>;
