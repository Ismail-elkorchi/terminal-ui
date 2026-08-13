import type { CollectionInteractionAction } from '../interaction/collection.ts';

type NavigationAction = Extract<
  CollectionInteractionAction,
  { readonly kind: 'setActive' | 'moveActive' | 'firstActive' | 'lastActive' | 'commitActive' }
>;

export type CheckboxGroupAction = NavigationAction | Extract<
  CollectionInteractionAction,
  { readonly kind: 'toggleSelection' | 'clearSelection' }
>;

export type RadioGroupAction = NavigationAction | Extract<
  CollectionInteractionAction,
  { readonly kind: 'select' | 'clearSelection' }
>;

export type ColorSwatchPickerAction = RadioGroupAction;
