export type PaginationTransition =
  | { readonly kind: 'first' }
  | { readonly kind: 'previous' }
  | { readonly kind: 'next' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly pageNumber: number };

export type PaginationControlTransition = Exclude<PaginationTransition, { readonly kind: 'select' }>;
