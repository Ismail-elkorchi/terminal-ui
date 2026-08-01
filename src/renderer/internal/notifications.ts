import type { RenderNodesOfKind } from '../model/index.ts';
import { fillTextCells, measureTextCells } from '../../text/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import { drawBorder } from './border.ts';
import type { BorderStyle } from './border.ts';
import type { RenderTarget } from '../contracts.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import type { Rect } from '../contracts.ts';
import { clipRenderSpans } from '../../visual/render.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { HitTarget } from '../contracts.ts';
import type { TerminalTheme, ThemeColorToken } from '../../theme/index.ts';
import type { NotificationItem, NotificationPlacement, NotificationTone } from '../../ui-model/feedback.ts';
import type {
  NotificationHistoryAction
} from '../../ui-model/notification.ts';
import { feedbackSpan } from './feedback-visual.ts';
import { mergeStyles } from '../style-resolution.ts';
import {
  placeNotificationStack,
  type NotificationStackSize
} from './notifications/placement.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';
import type { ElementVisualState } from '../../element/metadata.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export { placeNotificationStack } from './notifications/placement.ts';
export type { NotificationStackPlacementInput, NotificationStackSize } from './notifications/placement.ts';

const MIN_NOTIFICATION_CARD_HEIGHT = 3;

interface NotificationCard {
  readonly item: NotificationItem;
  readonly selected: boolean;
  readonly state?: ElementVisualState;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly NotificationCardLine[];
}

interface NotificationCardLine {
  readonly kind: 'title' | 'message' | 'meta';
  readonly text: string;
}

export function renderNotifications(
  renderNode: NotificationNode,
  buffer: RenderTarget,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const cards = notificationCards(renderNode, buffer.widthProfile);
  if (cards.length === 0) return;
  for (const placement of notificationCardPlacements(renderNode, bounds, cards)) {
    renderNotificationCard(renderNode, placement.card, buffer, placement.bounds, theme);
  }
}

export function notificationPreferredSize(
  renderNode: NotificationNode,
  widthProfile: TextWidthProfile
): NotificationStackSize {
  return notificationSizeFromCards(notificationCards(renderNode, widthProfile));
}

export function notificationAccessibleBase(
  renderNode: NotificationNode,
  id: string,
  focused: boolean,
  focusedTargetId: string | undefined
): AccessibleNode {
  const items = notificationItems(renderNode);
  const selected = notificationSelectedId(renderNode);
  const navigable = renderNode.kind === 'notificationHistory';
  return {
    id,
    role: navigable ? 'listbox' : 'status',
    label: 'Notifications',
    description: `${String(items.length)} visible notification${items.length === 1 ? '' : 's'}.`,
    ...(navigable ? {} : { live: items.some((item) => item.tone === 'error') ? 'assertive' as const : 'polite' as const }),
    scope: { kind: 'popover' },
    ...(focused ? { focused } : {}),
    children: items.map((item): AccessibleNode => {
      const description = notificationDescription(item);
      return {
        id: `${id}:notification:${item.id}`,
        role: navigable ? 'option' : 'status',
        label: item.title,
        ...(navigable ? { selected: item.id === selected } : {}),
        ...(description === undefined ? {} : { description }),
        children: [
          ...(item.progress === undefined ? [] : [{
            id: `${id}:notification:${item.id}:progress`,
            role: 'progressbar' as const,
            label: `${item.title} progress`,
            numericValue: { current: clampProgress(item.progress), minimum: 0, maximum: 100 }
          }]),
          ...(renderNode.kind !== 'notificationRegion'
            || !notificationCanDismiss(renderNode, item)
            ? []
            : [{
                id: notificationDismissTargetId(renderNode, item.id),
                role: 'button' as const,
                label: `Dismiss ${item.title}`,
                ...(focusedTargetId === notificationDismissTargetId(renderNode, item.id)
                  ? { focused: true }
                  : {})
              }])
        ],
        ...(navigable ? {} : { live: item.tone === 'error' ? 'assertive' as const : 'polite' as const })
      };
    })
  };
}

export function notificationHitTargets<TMessage>(
  renderNode: NotificationNode<TMessage>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toActionMessage = notificationActionMessageFactory(renderNode);
  const toDismissMessage = notificationDismissMessageFactory(renderNode);
  if (toActionMessage === undefined && toDismissMessage === undefined) return [];
  return notificationCardPlacements(renderNode, bounds, notificationCards(renderNode, widthProfile))
    .flatMap((placement): readonly HitTarget<TMessage>[] => {
    const id = notificationTargetId(renderNode, placement.card.item.id);
    const select: readonly HitTarget<TMessage>[] = toActionMessage === undefined ? [] : [{
      id,
      bounds: placement.bounds,
      accepts: ['click'],
      cursor: 'pointer',
      message: () => toActionMessage({ kind: 'select', id: placement.card.item.id })
    }];
    if (!notificationCanDismiss(renderNode, placement.card.item) || placement.bounds.width < 3) {
      return select;
    }
    const dismiss = toDismissMessage ?? (toActionMessage === undefined
      ? undefined
      : (itemId: string) => toActionMessage({ kind: 'remove', id: itemId }));
    if (dismiss === undefined) return select;
    return [...select, {
      id: notificationDismissTargetId(renderNode, placement.card.item.id),
      bounds: {
        row: placement.bounds.row,
        column: placement.bounds.column + placement.bounds.width - 2,
        width: 1,
        height: 1
      },
      accepts: ['click'],
      cursor: 'pointer',
      message: () => dismiss(placement.card.item.id)
    }];
  });
}

export function notificationFocusTargets(
  renderNode: NotificationNode,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly import('../contracts.ts').FocusTarget[] {
  if (renderNode.focusable !== true) return [];
  if (renderNode.kind === 'notificationHistory') {
    return [{ id: 'self', bounds }];
  }
  if (renderNode.props.toDismissMessage === undefined) return [];
  return notificationCardPlacements(
    renderNode,
    bounds,
    notificationCards(renderNode, widthProfile)
  ).flatMap((placement) => {
    if (!notificationCanDismiss(renderNode, placement.card.item) || placement.bounds.width < 3) {
      return [];
    }
    return [{
      id: notificationDismissTargetId(renderNode, placement.card.item.id),
      bounds: {
        row: placement.bounds.row,
        column: placement.bounds.column + placement.bounds.width - 2,
        width: 1,
        height: 1
      }
    }];
  });
}

function notificationCardPlacements(renderNode: NotificationNode, bounds: Rect, cards: readonly NotificationCard[]): readonly {
  readonly card: NotificationCard;
  readonly bounds: Rect;
}[] {
  if (bounds.width <= 0 || bounds.height <= 0 || cards.length === 0) return [];
  const size = notificationSizeFromCards(cards);
  const stack = placeNotificationStack({
    viewport: bounds,
    size,
    placement: notificationPlacement(renderNode),
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
  renderNode: NotificationNode,
  card: NotificationCard,
  buffer: RenderTarget,
  bounds: Rect,
  theme: TerminalTheme
): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const tone = card.item.tone ?? 'info';
  fillCardBackground(buffer, renderNode, bounds, card.item, tone, card.state);
  drawBorder(buffer, bounds, notificationBorder(renderNode, card, tone, theme), theme);
  if (notificationCanDismiss(renderNode, card.item) && bounds.width >= 3) {
    const dismissState = interactionVisualState(renderNode, notificationDismissTargetId(renderNode, card.item.id), {
      selected: card.selected
    });
    buffer.write(bounds.row, bounds.column + bounds.width - 2, [{
      text: '×',
      style: notificationPartStyle(renderNode, 'dismiss', tone, false, dismissState),
      source: renderNodeFrameSource(renderNode, {
        rendererFamily: 'feedback',
        cellRole: 'text',
        partName: 'dismiss',
        partType: 'notification',
        itemId: card.item.id,
        ...(isFrameCellInteractionState(dismissState) ? { interactionState: dismissState } : {}),
        description: 'dismiss'
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
    const source = renderNodeFrameSource(renderNode, {
        rendererFamily: 'feedback',
        cellRole: 'text',
        partName: cardLine.kind,
        partType: 'notification',
        itemId: card.item.id,
        ...(isFrameCellInteractionState(card.state) ? { interactionState: card.state } : {}),
        description: cardLine.kind
    });
    buffer.write(contentBounds.row + index, contentBounds.column, clipRenderSpans([{
      text: cardLine.text,
      style: notificationPartStyle(renderNode, cardLine.kind === 'meta' ? 'detail' : cardLine.kind, tone, index === 0, card.state),
      source
    }], contentBounds.width, {
      ellipsis: '…',
      mode: 'middle',
      widthProfile: buffer.widthProfile
    }));
  }
  if (card.item.progress !== undefined && contentBounds.height > 0) {
    const progressRow = contentBounds.row + contentBounds.height - 1;
    buffer.write(progressRow, contentBounds.column, progressSpans(
      renderNode,
      card.item,
      contentBounds.width,
      tone,
      theme,
      card.state,
      buffer.widthProfile
    ));
  }
}

function notificationCards(renderNode: NotificationNode, widthProfile: TextWidthProfile): readonly NotificationCard[] {
  const maxWidth = notificationMaxWidth(renderNode);
  const selected = notificationSelectedId(renderNode);
  return notificationItems(renderNode).map((item) => {
    const lines = cardContentLines(item);
    const contentWidth = lines.reduce(
      (max, line) => Math.max(max, measureTextCells(line.text, { widthProfile }).cells),
      0
    );
    const titleWidth = measureTextCells(` ${item.title} `, { widthProfile }).cells;
    const progressWidth = item.progress === undefined ? 0 : Math.min(maxWidth - 2, 22);
    const width = Math.max(20, Math.min(maxWidth, Math.max(contentWidth, titleWidth, progressWidth) + 2));
    const height = Math.max(3, lines.length + 2 + (item.progress === undefined ? 0 : 1));
    const itemSelected = item.id === selected;
    const state = interactionVisualState(renderNode, notificationTargetId(renderNode, item.id), { selected: itemSelected });
    return { item, selected: itemSelected, ...(state === undefined ? {} : { state }), width, height, lines };
  });
}

function notificationSizeFromCards(cards: readonly NotificationCard[]): NotificationStackSize {
  if (cards.length === 0) return { width: 0, height: 0 };
  return {
    width: cards.reduce((max, card) => Math.max(max, card.width), 0),
    height: cards.reduce((sum, card, index) => sum + card.height + (index === 0 ? 0 : 1), 0)
  };
}

function notificationItems(renderNode: NotificationNode): readonly NotificationItem[] {
  return renderNode.props.items;
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
  renderNode: NotificationNode,
  bounds: Rect,
  item: NotificationItem,
  tone: NotificationTone,
  state: ElementVisualState | undefined
): void {
  const style = notificationPartStyle(renderNode, 'background', tone, false, state, {
    bg: { kind: 'theme', token: isHighlightedState(state) ? 'selection.background' : backgroundToken(tone) }
  });
  const line = ' '.repeat(bounds.width);
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    buffer.write(row, bounds.column, [{
      text: line,
      style,
      source: renderNodeFrameSource(renderNode, {
        rendererFamily: 'feedback',
        cellRole: 'decoration',
        partName: 'background',
        itemId: item.id,
        ...(isFrameCellInteractionState(state) ? { interactionState: state } : {}),
        description: 'background'
      })
    }]);
  }
}

function progressSpans(
  renderNode: NotificationNode,
  item: NotificationItem,
  width: number,
  tone: NotificationTone,
  theme: TerminalTheme,
  state: ElementVisualState | undefined,
  widthProfile: TextWidthProfile
): readonly RenderSpan[] {
  const progress = clampProgress(item.progress ?? 0);
  const barWidth = Math.max(1, Math.min(width - 6, 18));
  const filled = Math.round((progress / 100) * barWidth);
  return [
    feedbackSpan(renderNode, fillTextCells(theme.tokens.symbols.progressFilled, filled, { widthProfile }), {
      kind: 'notification',
      label: 'progress.filled',
      sourceId: item.id,
      role: 'decoration',
      style: notificationPartStyle(renderNode, 'progress', tone, true, state, {
        fg: { kind: 'theme', token: foregroundToken(tone) },
        bold: true
      })
    }),
    feedbackSpan(renderNode, fillTextCells(theme.tokens.symbols.progressEmpty, barWidth - filled, { widthProfile }), {
      kind: 'notification',
      label: 'progress.empty',
      sourceId: item.id,
      role: 'decoration',
      style: notificationPartStyle(renderNode, 'progress', tone, false, state, {
        fg: { kind: 'theme', token: 'text.muted' }
      })
    }),
    feedbackSpan(renderNode, ` ${String(progress)}%`, {
      kind: 'notification',
      label: 'progress.value',
      sourceId: item.id,
      style: notificationPartStyle(renderNode, 'progress', tone, false, state),
      ...(isFrameCellInteractionState(state) ? { state } : {})
    })
  ];
}

function notificationBorder(
  renderNode: NotificationNode,
  card: NotificationCard,
  tone: NotificationTone,
  theme: TerminalTheme
): BorderStyle {
  return {
    kind: 'rounded',
    title: notificationTitle(card, tone, theme),
    style: notificationPartStyle(renderNode, 'border', tone, false, card.state, {
      fg: { kind: 'theme', token: isHighlightedState(card.state) ? 'selection.foreground' : borderToken(tone) }
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
  renderNode: NotificationNode,
  part: 'background' | 'border' | 'detail' | 'dismiss' | 'message' | 'progress' | 'title',
  tone: NotificationTone,
  emphasized: boolean,
  state: ElementVisualState | undefined,
  base?: TerminalStyle
): TerminalStyle {
  return mergeStyles({
    fg: { kind: 'theme', token: emphasized ? foregroundToken(tone) : 'text.default' },
    ...(isHighlightedState(state) ? { bg: { kind: 'theme', token: 'selection.background' } } : {}),
    bold: emphasized || tone === 'error' || tone === 'success'
  }, base, renderNode.styles?.parts?.[part], state === undefined || state === 'default' ? undefined : renderNode.styles?.states?.[state]) ?? {};
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
  switch (tone) {
    case 'progress':
      return 'status.running';
    case 'success':
      return 'status.success';
    case 'warning':
      return 'status.warning';
    case 'error':
      return 'status.error';
    case 'info':
      return 'status.info';
  }
}

function notificationPlacement(renderNode: NotificationNode): NotificationPlacement {
  return renderNode.props.placement ?? 'top-right';
}

function notificationMaxWidth(renderNode: NotificationNode): number {
  const value = renderNode.props.maxWidth;
  return value === undefined ? 44 : Math.max(20, Math.min(120, Math.floor(value)));
}

function notificationSelectedId(renderNode: NotificationNode): string | undefined {
  return renderNode.kind === 'notificationHistory'
    ? renderNode.props.selectedId
    : undefined;
}

function notificationActionMessageFactory<TMessage>(
  renderNode: NotificationNode<TMessage>
): ((action: NotificationHistoryAction) => TMessage) | undefined {
  return renderNode.kind === 'notificationHistory'
    ? renderNode.props.toActionMessage
    : undefined;
}

function notificationDismissMessageFactory<TMessage>(renderNode: NotificationNode<TMessage>): ((id: string) => TMessage) | undefined {
  return renderNode.kind === 'notificationRegion'
    ? renderNode.props.toDismissMessage
    : undefined;
}

function notificationCanDismiss(
  renderNode: NotificationNode,
  item: NotificationItem
): boolean {
  return item.dismissible !== false
    && (notificationDismissMessageFactory(renderNode) !== undefined
      || notificationActionMessageFactory(renderNode) !== undefined);
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

function notificationTargetId(renderNode: NotificationNode, itemId: string): string {
  return renderNodeTargetId(renderNode, 'notification', itemId);
}

function notificationDismissTargetId(renderNode: NotificationNode, itemId: string): string {
  return renderNodeTargetId(renderNode, 'notification', itemId, 'dismiss');
}

function isHighlightedState(state: ElementVisualState | undefined): boolean {
  return state === 'selected' || state === 'hovered' || state === 'pressed' || state === 'focused';
}

type NotificationNode<TMessage = unknown> = RenderNodesOfKind<
  TMessage,
  'notificationRegion' | 'notificationHistory'
>;
