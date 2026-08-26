export interface TabsState<TId extends string = string> {
  readonly activeId?: TId;
  readonly selectedId?: TId;
}

export type TabsActivation = 'automatic' | 'manual';

export type TabsTransition<TId extends string = string> =
  | { readonly kind: 'setActive'; readonly id: TId }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'select'; readonly id: TId }
  | { readonly kind: 'selectActive' };

export interface TabCloseEvent<TId extends string = string> {
  readonly kind: 'close';
  readonly id: TId;
}
