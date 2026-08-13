import { registerImmutableIdentity } from '../immutable-identity.ts';
import { findUnsupportedField, isNonArrayObject } from '../foundation/validation.ts';

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

const pointerStates = new WeakSet<object>();

/** Adopt caller-owned pointer state once at the boundary that first consumes it. */
export function preparePointerInteractionState(
  value: unknown,
  subject: string,
): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'object' && value !== null && pointerStates.has(value)) {
    return value;
  }
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unsupported = findUnsupportedField(
    value,
    new Set(['hoveredTargetId', 'pressedTargetId']),
  );
  if (unsupported !== undefined) {
    throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  }
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`${subject}.${field} must be a string.`);
    }
  }
  const state = Object.freeze({
    ...(typeof value['hoveredTargetId'] === 'string'
      ? { hoveredTargetId: value['hoveredTargetId'] }
      : {}),
    ...(typeof value['pressedTargetId'] === 'string'
      ? { pressedTargetId: value['pressedTargetId'] }
      : {}),
  });
  pointerStates.add(state);
  return registerImmutableIdentity(state);
}

export function pointerVisualState(
  state: PointerInteractionState | undefined,
  targetId: string
): PointerVisualState | undefined {
  if (state?.pressedTargetId === targetId) return 'pressed';
  return state?.hoveredTargetId === targetId ? 'hovered' : undefined;
}
