export type PaginationAction =
  | { readonly kind: 'first' }
  | { readonly kind: 'previous' }
  | { readonly kind: 'next' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly pageNumber: number };

export type PaginationTransition = Exclude<PaginationAction, { readonly kind: 'select' }>;
