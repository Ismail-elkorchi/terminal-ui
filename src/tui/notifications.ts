import { measureTextCells } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import { drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import { widgetFrameSource } from './frame-source.ts';
import type { Rect } from './layout.ts';
import { clipRenderSpans } from './render-primitives.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';
import { numberProp } from './widget-props.ts';
import type { HitTarget } from './widget-renderer.ts';
import type { TerminalTheme, ThemeColorToken } from '../theme/index.ts';
import type { NotificationItem, NotificationPlacement, NotificationTone, Widget } from '../widgets/index.ts';
import { normalizeNotificationTone, statusFromTone } from '../widgets/index.ts';
import { feedbackSpan } from './feedback-visual.ts';
import { statusToken } from './status-visual.ts';

const MIN_NOTIFICATION_CARD_HEIGHT = 3;

export interface NotificationStackSize {
  readonly width: number;
  readonly height: number;
}

export interface NotificationStackPlacementInput {
  readonly viewport: Rect;
  readonly size: NotificationStackSize;
  readonly placement?: NotificationPlacement;
  readonly margin?: number;
}

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
  widget: Widget,
  buffer: FrameBuffer,
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

export function notificationStackPreferredSize(widget: Widget): NotificationStackSize {
  return notificationStackSizeFromCards(notificationCards(widget));
}

export function notificationStackAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const items = notificationItems(widget);
  const selected = notificationSelectedIndex(widget);
  return {
    id,
    role: 'status',
    label: 'Notifications',
    description: `${String(items.length)} visible notification${items.length === 1 ? '' : 's'}.`,
    live: items.some((item) => item.tone === 'error') ? 'assertive' : 'polite',
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {}),
    children: items.map((item, index): AccessibleNode => {
      const description = notificationDescription(item);
      return {
        id: `${id}:notification:${item.id}`,
        role: 'status',
        label: item.title,
        selected: index === selected,
        ...(description === undefined ? {} : { description }),
        ...(item.progress === undefined ? {} : { progress: { value: clampProgress(item.progress), max: 100 } }),
        live: item.tone === 'error' ? 'assertive' : 'polite'
      };
    })
  };
}

export function notificationStackHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toDismissMessage = notificationDismissMessageFactory(widget);
  if (toDismissMessage === undefined) return [];
  return notificationCardPlacements(widget, bounds).map((placement): HitTarget<TMessage> => ({
    id: `${widget.id ?? 'notificationStack'}:notification:${placement.card.item.id}`,
    bounds: placement.bounds,
    accepts: ['click'],
    cursor: 'pointer',
    message: () => toDismissMessage(placement.card.item)
  }));
}

export function placeNotificationStack(input: NotificationStackPlacementInput): Rect {
  const margin = Math.max(0, Math.floor(input.margin ?? 1));
  const usable = insetRect(input.viewport, margin);
  const width = Math.min(input.size.width, usable.width);
  const height = Math.min(input.size.height, usable.height);
  const placement = input.placement ?? 'top-right';
  const base = placeStackInArea(usable, { width, height }, placement);
  return clampRect(base, input.viewport);
}

function notificationCardPlacements(widget: Widget, bounds: Rect, cards: readonly NotificationCard[] = notificationCards(widget)): readonly {
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
  widget: Widget,
  card: NotificationCard,
  buffer: FrameBuffer,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = normalizeNotificationTone(card.item.tone);
  fillCardBackground(buffer, widget, bounds, card.item, tone, card.selected);
  drawBorder(buffer, bounds, notificationBorder(card, tone, theme), theme);
  const contentBounds = {
    row: bounds.row + 1,
    column: bounds.column + 1,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 2)
  };
  for (let index = 0; index < Math.min(card.lines.length, contentBounds.height); index += 1) {
    const cardLine = card.lines[index] ?? { kind: 'message', text: '' };
    const source = widgetFrameSource(widget, {
        family: 'feedback',
        role: 'text',
        part: cardLine.kind,
        itemId: card.item.id,
        label: cardLine.kind
    });
    buffer.write(contentBounds.row + index, contentBounds.column, clipRenderSpans([{
      text: cardLine.text,
      style: cardTextStyle(tone, index === 0, card.selected),
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

function notificationCards(widget: Widget): readonly NotificationCard[] {
  const maxWidth = notificationMaxWidth(widget);
  const selected = notificationSelectedIndex(widget);
  return notificationItems(widget).map((item, index) => {
    const lines = cardContentLines(item);
    const contentWidth = lines.reduce((max, line) => Math.max(max, measureTextCells(line.text).cells), 0);
    const titleWidth = measureTextCells(` ${item.title} `).cells;
    const progressWidth = item.progress === undefined ? 0 : Math.min(maxWidth - 2, 22);
    const width = Math.max(20, Math.min(maxWidth, Math.max(contentWidth, titleWidth, progressWidth) + 2));
    const height = Math.max(3, lines.length + 2 + (item.progress === undefined ? 0 : 1));
    return { item, selected: index === selected, width, height, lines };
  });
}

function notificationStackSizeFromCards(cards: readonly NotificationCard[]): NotificationStackSize {
  if (cards.length === 0) return { width: 0, height: 0 };
  return {
    width: cards.reduce((max, card) => Math.max(max, card.width), 0),
    height: cards.reduce((sum, card, index) => sum + card.height + (index === 0 ? 0 : 1), 0)
  };
}

function notificationItems(widget: Widget): readonly NotificationItem[] {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  return items.filter(isNotificationItem).slice(0, notificationMaxVisible(widget));
}

function cardContentLines(item: NotificationItem): readonly NotificationCardLine[] {
  return [
    { kind: 'title', text: item.title },
    ...(item.message === undefined ? [] : [{ kind: 'message' as const, text: item.message }]),
    ...notificationMetaLines(item).map((text): NotificationCardLine => ({ kind: 'meta', text }))
  ];
}

function fillCardBackground(
  buffer: FrameBuffer,
  widget: Widget,
  bounds: Rect,
  item: NotificationItem,
  tone: NotificationTone,
  selected: boolean
): void {
  const style: TerminalStyle = { bg: { kind: 'theme', token: selected ? 'selection.background' : backgroundToken(tone) } };
  const line = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: line,
      style,
      source: widgetFrameSource(widget, {
        family: 'feedback',
        role: 'decoration',
        part: 'background',
        itemId: item.id,
        label: 'background'
      })
    }]);
  }
}

function progressSpans(
  widget: Widget,
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
      style: { fg: { kind: 'theme', token: foregroundToken(tone) }, bold: true }
    }),
    feedbackSpan(widget, theme.tokens.symbols.progressEmpty.repeat(barWidth - filled), {
      kind: 'notification',
      label: 'progress.empty',
      sourceId: item.id,
      role: 'decoration',
      style: { fg: { kind: 'theme', token: 'text.muted' } }
    }),
    feedbackSpan(widget, ` ${String(progress)}%`, {
      kind: 'notification',
      label: 'progress.value',
      sourceId: item.id,
      style: cardTextStyle(tone, false, selected)
    })
  ];
}

function notificationBorder(card: NotificationCard, tone: NotificationTone, theme: TerminalTheme): BorderStyle {
  return {
    kind: 'rounded',
    title: notificationTitle(card, tone, theme),
    style: { fg: { kind: 'theme', token: card.selected ? 'selection.foreground' : borderToken(tone) } }
  };
}

function notificationTitle(card: NotificationCard, tone: NotificationTone, theme: TerminalTheme): string {
  const marker = card.selected ? `${theme.tokens.symbols.pointer} ` : '';
  const paused = card.item.paused === true ? ' paused' : '';
  return `${marker}${toneLabel(tone)}${paused}`;
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

function cardTextStyle(tone: NotificationTone, title: boolean, selected: boolean): TerminalStyle {
  return {
    fg: { kind: 'theme', token: title ? foregroundToken(tone) : 'text.default' },
    ...(selected ? { bg: { kind: 'theme', token: 'selection.background' } } : {}),
    bold: title || tone === 'error' || tone === 'success'
  };
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

function notificationPlacement(widget: Widget): NotificationPlacement {
  const placement = widget.props['placement'];
  return placement === 'bottom-right' || placement === 'centered-stack' ? placement : 'top-right';
}

function notificationMaxVisible(widget: Widget): number {
  const value = numberProp(widget, 'maxVisible');
  return value === undefined ? 4 : Math.max(1, Math.min(12, Math.floor(value)));
}

function notificationMaxWidth(widget: Widget): number {
  const value = numberProp(widget, 'maxWidth');
  return value === undefined ? 44 : Math.max(20, Math.min(120, Math.floor(value)));
}

function notificationSelectedIndex(widget: Widget): number {
  const value = numberProp(widget, 'selected');
  if (value === undefined) return -1;
  return Math.max(0, Math.floor(value));
}

function notificationDismissMessageFactory<TMessage>(widget: Widget<TMessage>): ((item: NotificationItem) => TMessage) | undefined {
  const candidate = widget.props['toDismissMessage'];
  return typeof candidate === 'function' ? candidate as (item: NotificationItem) => TMessage : undefined;
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
  const parts = [
    item.paused === true ? 'paused' : undefined,
    ttlText(item)
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length === 0 ? [] : [parts.join(' · ')];
}

function notificationDescription(item: NotificationItem): string | undefined {
  const parts = [
    item.message,
    ...notificationMetaLines(item)
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length === 0 ? undefined : parts.join(' ');
}

function ttlText(item: NotificationItem): string | undefined {
  if (
    typeof item.createdAt !== 'number'
    || typeof item.expiresAt !== 'number'
    || !Number.isFinite(item.createdAt)
    || !Number.isFinite(item.expiresAt)
    || item.expiresAt <= item.createdAt
  ) {
    return undefined;
  }
  return `ttl ${formatDuration(item.expiresAt - item.createdAt)}`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds === 0
    ? `${String(minutes)}m`
    : `${String(minutes)}m${String(remainingSeconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h${String(remainingMinutes).padStart(2, '0')}m`;
}

function clampRect(rect: Rect, viewport: Rect): Rect {
  const width = Math.max(0, Math.min(rect.width, viewport.width));
  const height = Math.max(0, Math.min(rect.height, viewport.height));
  return {
    row: Math.max(viewport.row, Math.min(rect.row, viewport.row + viewport.height - height)),
    column: Math.max(viewport.column, Math.min(rect.column, viewport.column + viewport.width - width)),
    width,
    height
  };
}

function insetRect(rect: Rect, margin: number): Rect {
  return normalizeRect({
    row: rect.row + margin,
    column: rect.column + margin,
    width: Math.max(0, rect.width - margin * 2),
    height: Math.max(0, rect.height - margin * 2)
  });
}

function placeStackInArea(
  area: Rect,
  size: NotificationStackSize,
  placement: NotificationPlacement
): Rect {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  if (placement === 'centered-stack') {
    return {
      row: area.row + Math.floor((area.height - height) / 2),
      column: area.column + Math.floor((area.width - width) / 2),
      width,
      height
    };
  }
  return {
    row: placement === 'bottom-right' ? area.row + area.height - height : area.row,
    column: area.column + area.width - width,
    width,
    height
  };
}

function normalizeRect(rect: Rect): Rect {
  return {
    row: Math.floor(Number.isFinite(rect.row) ? rect.row : 0),
    column: Math.floor(Number.isFinite(rect.column) ? rect.column : 0),
    width: Math.max(0, Math.floor(Number.isFinite(rect.width) ? rect.width : 0)),
    height: Math.max(0, Math.floor(Number.isFinite(rect.height) ? rect.height : 0))
  };
}
