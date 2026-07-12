export type NotificationStackAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: -1 | 1 }
  | { readonly kind: 'dismiss'; readonly id: string };
