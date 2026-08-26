import type { CollectionInteractionTransition } from '../interaction/collection-interaction.ts';

type NavigationTransition = Extract<
  CollectionInteractionTransition,
  { readonly kind: 'setActive' | 'moveActive' | 'firstActive' | 'lastActive' | 'commitActive' }
>;

export type CheckboxGroupTransition = NavigationTransition | Extract<
  CollectionInteractionTransition,
  { readonly kind: 'toggleSelection' | 'clearSelection' }
>;

export type RadioGroupTransition = NavigationTransition | Extract<
  CollectionInteractionTransition,
  { readonly kind: 'select' | 'clearSelection' }
>;

export type ColorSwatchPickerTransition = RadioGroupTransition;

export type CheckboxGroupControlTransition = Extract<
  CheckboxGroupTransition,
  { readonly kind: 'moveActive' | 'firstActive' | 'lastActive' | 'toggleSelection' }
>;

export type RadioGroupControlTransition = Extract<
  RadioGroupTransition,
  { readonly kind: 'moveActive' | 'firstActive' | 'lastActive' | 'commitActive' | 'select' }
>;

export type ColorSwatchPickerControlTransition = RadioGroupControlTransition;
