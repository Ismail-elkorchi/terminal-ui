import type { RecordStatus } from './contracts.ts';

export type ActivityFeedAction =
  | { readonly kind: 'select'; readonly index: number }
  | { readonly kind: 'selectNext' }
  | { readonly kind: 'selectPrevious' }
  | { readonly kind: 'toggleBlock'; readonly id?: string }
  | { readonly kind: 'expandBlock'; readonly id?: string }
  | { readonly kind: 'collapseBlock'; readonly id?: string }
  | { readonly kind: 'setStatusFilter'; readonly statuses?: readonly RecordStatus[] }
  | { readonly kind: 'jumpToFirstProblem' };
