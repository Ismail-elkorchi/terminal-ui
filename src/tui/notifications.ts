import { clipTextCells, measureTextCells, wrapTextCells } from '../text/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import { drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { FrameBuffer } from './frame-buffer.ts';
import type { Rect } from './layout.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';
import { numberProp } from './widget-props.ts';
import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { NotificationItem, NotificationPlacement, NotificationTone, Widget } from '../widgets/index.ts';

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
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
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
  const size = notificationStackSizeFromCards(cards);
  const stack = placeNotificationStack({
    viewport: bounds,
    size,
    placement: notificationPlacement(widget),
    margin: 1
  });
  let row = stack.row;
  for (const card of cards) {
    if (row > stack.row + stack.height - 1) return;
    const cardBounds = {
      row,
      column: stack.column + Math.max(0, stack.width - card.width),
      width: Math.min(card.width, stack.width),
      height: Math.min(card.height, stack.row + stack.height - row)
    };
    renderNotificationCard(card, buffer, cardBounds, theme);
    row += card.height + 1;
  }
}

export function notificationStackPreferredSize(widget: Widget): NotificationStackSize {
  return notificationStackSizeFromCards(notificationCards(widget));
}

export function notificationStackAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const items = notificationItems(widget);
  return {
    id,
    role: 'status',
    label: 'Notifications',
    description: `${String(items.length)} visible notification${items.length === 1 ? '' : 's'}.`,
    live: items.some((item) => item.tone === 'error') ? 'assertive' : 'polite',
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {}),
    children: items.map((item): AccessibleNode => ({
      id: `${id}:notification:${item.id}`,
      role: 'status',
      label: item.title,
      ...(item.message === undefined ? {} : { description: item.message }),
      ...(item.progress === undefined ? {} : { progress: { value: clampProgress(item.progress), max: 100 } }),
      live: item.tone === 'error' ? 'assertive' : 'polite'
    }))
  };
}

export function placeNotificationStack(input: NotificationStackPlacementInput): Rect {
  const margin = Math.max(0, Math.floor(input.margin ?? 1));
  const width = Math.min(input.size.width, Math.max(0, input.viewport.width - margin * 2));
  const height = Math.min(input.size.height, Math.max(0, input.viewport.height - margin * 2));
  const placement = input.placement ?? 'top-right';
  const row = placement === 'bottom-right'
    ? input.viewport.row + input.viewport.height - height - margin
    : placement === 'centered-stack'
      ? input.viewport.row + Math.floor((input.viewport.height - height) / 2)
      : input.viewport.row + margin;
  const column = placement === 'centered-stack'
    ? input.viewport.column + Math.floor((input.viewport.width - width) / 2)
    : input.viewport.column + input.viewport.width - width - margin;
  return clampRect({ row, column, width, height }, input.viewport);
}

function renderNotificationCard(
  card: NotificationCard,
  buffer: FrameBuffer,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = notificationTone(card.item);
  fillCardBackground(buffer, bounds, tone);
  drawBorder(buffer, bounds, notificationBorder(card.item, tone), theme);
  const contentBounds = {
    row: bounds.row + 1,
    column: bounds.column + 1,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 2)
  };
  for (let index = 0; index < Math.min(card.lines.length, contentBounds.height); index += 1) {
    buffer.write(contentBounds.row + index, contentBounds.column, [{
      text: clipTextCells(card.lines[index] ?? '', contentBounds.width).text,
      style: cardTextStyle(tone, index === 0),
      source: { kind: 'notification', role: 'text', id: card.item.id }
    }]);
  }
  if (card.item.progress !== undefined && contentBounds.height > 0) {
    const progressRow = contentBounds.row + contentBounds.height - 1;
    buffer.write(progressRow, contentBounds.column, progressSpans(card.item, contentBounds.width, tone, theme));
  }
}

function notificationCards(widget: Widget): readonly NotificationCard[] {
  const maxWidth = notificationMaxWidth(widget);
  return notificationItems(widget).map((item) => {
    const lines = cardContentLines(item, Math.max(1, maxWidth - 2));
    const contentWidth = lines.reduce((max, line) => Math.max(max, measureTextCells(line).cells), 0);
    const titleWidth = measureTextCells(` ${item.title} `).cells;
    const progressWidth = item.progress === undefined ? 0 : Math.min(maxWidth - 2, 22);
    const width = Math.max(20, Math.min(maxWidth, Math.max(contentWidth, titleWidth, progressWidth) + 2));
    const height = Math.max(3, lines.length + 2 + (item.progress === undefined ? 0 : 1));
    return { item, width, height, lines };
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

function cardContentLines(item: NotificationItem, width: number): readonly string[] {
  const message = item.message === undefined ? [] : wrapTextCells(item.message, Math.max(1, width), { preserveWords: true }).slice(0, 2);
  return [item.title, ...message.map((line) => line.text)];
}

function fillCardBackground(buffer: FrameBuffer, bounds: Rect, tone: NotificationTone): void {
  const style: TerminalStyle = { bg: { kind: 'theme', token: backgroundToken(tone) } };
  const line = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: line,
      style,
      source: { kind: 'notification', role: 'decoration' }
    }]);
  }
}

function progressSpans(
  item: NotificationItem,
  width: number,
  tone: NotificationTone,
  theme: TerminalTheme
): readonly RenderSpan[] {
  const progress = clampProgress(item.progress ?? 0);
  const barWidth = Math.max(1, Math.min(width - 6, 18));
  const filled = Math.round((progress / 100) * barWidth);
  return [
    {
      text: theme.symbols.progressFilled.repeat(filled),
      style: { fg: { kind: 'theme', token: foregroundToken(tone) }, bold: true },
      source: { kind: 'notification', role: 'decoration', id: item.id, label: 'progress' }
    },
    {
      text: theme.symbols.progressEmpty.repeat(barWidth - filled),
      style: { fg: { kind: 'theme', token: 'text.muted' } },
      source: { kind: 'notification', role: 'decoration', id: item.id, label: 'progress' }
    },
    {
      text: ` ${String(progress)}%`,
      style: cardTextStyle(tone, false),
      source: { kind: 'notification', role: 'text', id: item.id, label: 'progress' }
    }
  ];
}

function notificationBorder(item: NotificationItem, tone: NotificationTone): BorderStyle {
  return {
    kind: 'rounded',
    title: notificationTitle(item, tone),
    style: { fg: { kind: 'theme', token: borderToken(tone) } }
  };
}

function notificationTitle(item: NotificationItem, tone: NotificationTone): string {
  return `${toneLabel(tone)} ${item.title}`;
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

function cardTextStyle(tone: NotificationTone, title: boolean): TerminalStyle {
  return {
    fg: { kind: 'theme', token: title ? foregroundToken(tone) : 'text.default' },
    bold: title || tone === 'error' || tone === 'success'
  };
}

function backgroundToken(tone: NotificationTone): ThemeToken {
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

function borderToken(tone: NotificationTone): ThemeToken {
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

function foregroundToken(tone: NotificationTone): ThemeToken {
  switch (tone) {
    case 'success':
      return 'status.success';
    case 'warning':
      return 'status.warning';
    case 'error':
      return 'status.error';
    case 'progress':
      return 'status.running';
    case 'info':
      return 'status.info';
  }
}

function notificationTone(item: NotificationItem): NotificationTone {
  const tone = item.tone;
  return tone === 'success' || tone === 'warning' || tone === 'error' || tone === 'progress' ? tone : 'info';
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

function isNotificationItem(value: unknown): value is NotificationItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['id'] === 'string' && typeof candidate['title'] === 'string';
}

function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
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
