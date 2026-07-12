export type CommandBarAction =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'deleteBackward' }
  | { readonly kind: 'deleteForward' }
  | { readonly kind: 'deleteWordBackward' }
  | { readonly kind: 'deleteWordForward' }
  | { readonly kind: 'moveLeft'; readonly select?: boolean }
  | { readonly kind: 'moveRight'; readonly select?: boolean }
  | { readonly kind: 'moveWordLeft'; readonly select?: boolean }
  | { readonly kind: 'moveWordRight'; readonly select?: boolean }
  | { readonly kind: 'moveHome'; readonly select?: boolean }
  | { readonly kind: 'moveEnd'; readonly select?: boolean }
  | { readonly kind: 'selectAll' }
  | { readonly kind: 'historyPrevious' }
  | { readonly kind: 'historyNext' }
  | { readonly kind: 'selectSuggestion'; readonly direction: 1 | -1 }
  | { readonly kind: 'acceptSuggestion' }
  | { readonly kind: 'setValue'; readonly value: string };
