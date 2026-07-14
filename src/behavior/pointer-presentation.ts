import type {
  PointerPresentationAction,
  PointerPresentationState
} from '../interaction/pointer-presentation.ts';

export function pointerPresentationReducer(
  state: PointerPresentationState,
  action: PointerPresentationAction
): PointerPresentationState {
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
  state: PointerPresentationState,
  field: keyof PointerPresentationState
): PointerPresentationState {
  return {
    ...(field === 'hoveredTargetId' || state.hoveredTargetId === undefined
      ? {}
      : { hoveredTargetId: state.hoveredTargetId }),
    ...(field === 'pressedTargetId' || state.pressedTargetId === undefined
      ? {}
      : { pressedTargetId: state.pressedTargetId })
  };
}
