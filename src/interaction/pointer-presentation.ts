export interface PointerPresentationState {
  readonly hoveredTargetId?: string;
  readonly pressedTargetId?: string;
}

export type PointerPresentationAction =
  | { readonly kind: 'enter'; readonly targetId: string }
  | { readonly kind: 'leave'; readonly targetId: string }
  | { readonly kind: 'press'; readonly targetId: string }
  | { readonly kind: 'release'; readonly targetId: string };

export interface PointerPresentationOptions<TMessage> {
  readonly state?: PointerPresentationState;
  readonly onAction?: (action: PointerPresentationAction) => TMessage;
}

export type PointerVisualState = 'hovered' | 'pressed';

export function pointerVisualState(
  state: PointerPresentationState | undefined,
  targetId: string
): PointerVisualState | undefined {
  if (state?.pressedTargetId === targetId) return 'pressed';
  return state?.hoveredTargetId === targetId ? 'hovered' : undefined;
}
