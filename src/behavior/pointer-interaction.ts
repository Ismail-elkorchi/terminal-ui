import type {
  PointerInteractionAction,
  PointerInteractionState
} from '../interaction/pointer-interaction.ts';

export function pointerInteractionReducer(
  state: PointerInteractionState,
  action: PointerInteractionAction
): PointerInteractionState {
  switch (action.kind) {
    case 'enter':
      return { ...state, hoveredTargetId: action.targetId };
    case 'leave':
      return state.hoveredTargetId === action.targetId
        ? withoutTarget(state, 'hoveredTargetId')
        : state;
    case 'press':
      return { ...state, pressedTargetId: action.targetId };
    case 'release':
      return state.pressedTargetId === action.targetId
        ? withoutTarget(state, 'pressedTargetId')
        : state;
  }
}

function withoutTarget(
  state: PointerInteractionState,
  field: keyof PointerInteractionState
): PointerInteractionState {
  return {
    ...(field === 'hoveredTargetId' || state.hoveredTargetId === undefined
      ? {}
      : { hoveredTargetId: state.hoveredTargetId }),
    ...(field === 'pressedTargetId' || state.pressedTargetId === undefined
      ? {}
      : { pressedTargetId: state.pressedTargetId })
  };
}
