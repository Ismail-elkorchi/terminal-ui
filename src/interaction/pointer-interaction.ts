/** Runtime-owned hover and press relation supplied to component render hooks. */
export interface PointerInteractionState {
  readonly hoveredTargetId?: string;
  readonly pressedTargetId?: string;
}

export type PointerVisualState = 'hovered' | 'pressed';

export interface PointerVisualTarget {
  readonly ownerIdentity: string;
  readonly targetId: string;
}

export interface PointerVisualSnapshot {
  readonly hovered?: PointerVisualTarget;
  readonly pressed?: PointerVisualTarget;
}

export function pointerStateForOwner(
  snapshot: PointerVisualSnapshot | undefined,
  ownerIdentity: string,
): PointerInteractionState | undefined {
  const hoveredTargetId = snapshot?.hovered?.ownerIdentity === ownerIdentity
    ? snapshot.hovered.targetId
    : undefined;
  const pressedTargetId = snapshot?.pressed?.ownerIdentity === ownerIdentity
    ? snapshot.pressed.targetId
    : undefined;
  return hoveredTargetId === undefined && pressedTargetId === undefined
    ? undefined
    : Object.freeze({
        ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
        ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
      });
}

export function pointerVisualState(
  state: PointerInteractionState | undefined,
  targetId: string
): PointerVisualState | undefined {
  if (state?.pressedTargetId === targetId) return 'pressed';
  return state?.hoveredTargetId === targetId ? 'hovered' : undefined;
}
