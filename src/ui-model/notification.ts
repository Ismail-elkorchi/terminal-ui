export interface NotificationRegionAction { readonly kind: 'dismiss'; readonly id: string }

export type NotificationHistoryAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: -1 | 1 }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'remove'; readonly id: string };
