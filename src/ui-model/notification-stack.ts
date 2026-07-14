import type { NotificationItem } from './feedback.ts';

export type NotificationStackPresentation =
  | {
      readonly kind: 'live';
      readonly items: readonly NotificationItem[];
    }
  | {
      readonly kind: 'history';
      readonly items: readonly NotificationItem[];
      readonly selected?: string;
    };

export type NotificationStackAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: -1 | 1 }
  | { readonly kind: 'dismiss'; readonly id: string };
