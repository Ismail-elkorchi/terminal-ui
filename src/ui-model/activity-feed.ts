export type ActivityFeedAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'selectNext' }
  | { readonly kind: 'selectPrevious' }
  | { readonly kind: 'selectFirst' }
  | { readonly kind: 'selectLast' }
  | { readonly kind: 'toggleBlock'; readonly id?: string }
  | { readonly kind: 'expandBlock'; readonly id?: string }
  | { readonly kind: 'collapseBlock'; readonly id?: string };
