export interface NotificationRegionAction { readonly kind: 'dismiss'; readonly id: string }

import type { ScrollState } from '../interaction/scroll.ts';

export type NotificationHistoryTransition =
  | {
      readonly kind: 'selection';
      readonly selectedId: string;
      readonly scroll: ScrollState;
    }
  | { readonly kind: 'scroll'; readonly scroll: ScrollState }
  | { readonly kind: 'remove'; readonly id: string };
