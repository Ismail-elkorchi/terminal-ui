export interface TabsPresentation {
  readonly activeId?: string;
  readonly selectedId?: string;
}

export type TabsActivation = 'automatic' | 'manual';

export type TabsTransition =
  | { readonly kind: 'setActive'; readonly id: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'selectActive' };

export interface TabCloseEvent {
  readonly kind: 'close';
  readonly id: string;
}
