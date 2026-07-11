export interface Screen<TState = unknown> {
  readonly id: string;
  readonly state: TState;
}

export interface ScreenStack<TState = unknown> {
  readonly screens: readonly Screen<TState>[];
}

export type ScreenStackAction<TState = unknown> =
  | { readonly kind: 'push'; readonly screen: Screen<TState> }
  | { readonly kind: 'pop' }
  | { readonly kind: 'replace'; readonly screen: Screen<TState> }
  | { readonly kind: 'reset'; readonly screens: readonly Screen<TState>[] };

export function screenStackReducer<TState>(
  stack: ScreenStack<TState>,
  action: ScreenStackAction<TState>
): ScreenStack<TState> {
  switch (action.kind) {
    case 'push':
      return { screens: [...stack.screens, action.screen] };
    case 'pop':
      return { screens: stack.screens.slice(0, -1) };
    case 'replace':
      return { screens: [...stack.screens.slice(0, -1), action.screen] };
    case 'reset':
      return { screens: action.screens };
  }
}

export function activeScreen<TState>(stack: ScreenStack<TState>): Screen<TState> | undefined {
  return stack.screens.at(-1);
}
