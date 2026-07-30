import type { NotificationPlacement } from '../../../ui-model/feedback.ts';
import type { Rect } from '../../contracts.ts';

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

export function placeNotificationStack(input: NotificationStackPlacementInput): Rect {
  const margin = Math.max(0, Math.floor(input.margin ?? 1));
  const usable = insetRect(input.viewport, margin);
  const width = Math.min(input.size.width, usable.width);
  const height = Math.min(input.size.height, usable.height);
  const placement = input.placement ?? 'top-right';
  const base = placeStackInArea(usable, { width, height }, placement);
  return clampRect(base, input.viewport);
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
