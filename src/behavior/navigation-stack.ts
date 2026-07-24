export interface NavigationEntry<TState = unknown> {
  readonly id: string;
  readonly state: TState;
}

export interface NavigationStack<TState = unknown> {
  readonly entries: readonly NavigationEntry<TState>[];
}

export type NavigationStackAction<TState = unknown> =
  | { readonly kind: 'push'; readonly entry: NavigationEntry<TState> }
  | { readonly kind: 'pop' }
  | { readonly kind: 'replace'; readonly entry: NavigationEntry<TState> }
  | { readonly kind: 'reset'; readonly entries: readonly NavigationEntry<TState>[] };

export function navigationStackReducer<TState>(
  stack: NavigationStack<TState>,
  action: NavigationStackAction<TState>
): NavigationStack<TState> {
  switch (action.kind) {
    case 'push':
      return { entries: [...stack.entries, action.entry] };
    case 'pop':
      return { entries: stack.entries.slice(0, -1) };
    case 'replace':
      return { entries: [...stack.entries.slice(0, -1), action.entry] };
    case 'reset':
      return { entries: action.entries };
  }
}

export function activeNavigationEntry<TState>(
  stack: NavigationStack<TState>
): NavigationEntry<TState> | undefined {
  return stack.entries.at(-1);
}
