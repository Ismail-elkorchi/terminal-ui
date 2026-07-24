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

export function pointerVisualState(
  state: PointerInteractionState | undefined,
  targetId: string
): PointerVisualState | undefined {
  if (state?.pressedTargetId === targetId) return 'pressed';
  return state?.hoveredTargetId === targetId ? 'hovered' : undefined;
}
