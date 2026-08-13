import { isNonArrayObject } from '../foundation/validation.ts';

export interface PointerInteractionState {
  readonly hoveredTargetId?: string;
  readonly pressedTargetId?: string;
}

export type PointerInteractionAction =
  | { readonly kind: 'enter'; readonly targetId: string }
  | { readonly kind: 'leave'; readonly targetId: string }
  | { readonly kind: 'press'; readonly targetId: string }
  | { readonly kind: 'release'; readonly targetId: string };

export interface PointerInteractionOptions<TMessage> {
  readonly state?: PointerInteractionState;
  readonly onAction?: (action: PointerInteractionAction) => TMessage;
}

export type PointerVisualState = 'hovered' | 'pressed';

/** Adopt caller-owned pointer state once at the boundary that first consumes it. */
export function preparePointerInteractionState(
  value: unknown,
  subject: string,
  available = true,
): PointerInteractionState | undefined {
  if (!available) return undefined;
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const hoveredTargetId = value['hoveredTargetId'];
  const pressedTargetId = value['pressedTargetId'];
  if (hoveredTargetId !== undefined && typeof hoveredTargetId !== 'string') {
    throw new TypeError(`${subject}.hoveredTargetId must be a string.`);
  }
  if (pressedTargetId !== undefined && typeof pressedTargetId !== 'string') {
    throw new TypeError(`${subject}.pressedTargetId must be a string.`);
  }
  const state = Object.freeze({
    ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
    ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
  });
  return state;
}

export function pointerVisualState(
  state: PointerInteractionState | undefined,
  targetId: string
): PointerVisualState | undefined {
  if (state?.pressedTargetId === targetId) return 'pressed';
  return state?.hoveredTargetId === targetId ? 'hovered' : undefined;
}
