export interface HoverableState {
  readonly hoveredId?: string;
  readonly focusedId?: string;
}

export type HoverableAction =
  | { readonly kind: 'enter'; readonly id: string }
  | { readonly kind: 'leave'; readonly id: string }
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'blur'; readonly id: string };

export function hoverableReducer(state: HoverableState, action: HoverableAction): HoverableState {
  switch (action.kind) {
    case 'enter':
      return { ...state, hoveredId: action.id };
    case 'leave':
      return state.hoveredId === action.id ? omitHovered(state) : state;
    case 'focus':
      return { ...state, focusedId: action.id };
    case 'blur':
      return state.focusedId === action.id ? omitFocused(state) : state;
  }
}

export function hoverableActive(state: HoverableState, id: string): boolean {
  return state.hoveredId === id || state.focusedId === id;
}

function omitHovered(state: HoverableState): HoverableState {
  return {
    ...(state.focusedId === undefined ? {} : { focusedId: state.focusedId })
  };
}

function omitFocused(state: HoverableState): HoverableState {
  return {
    ...(state.hoveredId === undefined ? {} : { hoveredId: state.hoveredId })
  };
}
