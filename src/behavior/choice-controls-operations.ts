import type { ChoiceItem } from '../collection/item.ts';
import type {
  CheckboxGroupTransition,
  ColorSwatchPickerTransition,
  RadioGroupTransition,
} from './choice-controls.ts';
import {
  collectionInteractionReducer,
  normalizeCollectionInteraction,
  createCollectionInteractionIndex,
} from '../interaction/collection-interaction.ts';
import type { CollectionInteractionState } from '../interaction/collection-interaction.ts';
import { assertStableIds } from '../collection/identity.ts';

export type CheckboxGroupState = CollectionInteractionState;
export type RadioGroupState = CollectionInteractionState;
export type ColorSwatchPickerState = CollectionInteractionState;

export function checkboxGroupReducer<TValue>(
  state: CheckboxGroupState,
  transition: CheckboxGroupTransition,
  options: readonly ChoiceItem<TValue>[],
): CheckboxGroupState {
  return collectionInteractionReducer(state, transition, {
    index: createCollectionInteractionIndex(enabledIds(options, 'checkboxGroup')),
  });
}

export function normalizeCheckboxGroupState<TValue>(
  state: CheckboxGroupState,
  options: readonly ChoiceItem<TValue>[],
): CheckboxGroupState {
  return normalizeCollectionInteraction(
    state,
    createCollectionInteractionIndex(enabledIds(options, 'checkboxGroup')),
  );
}

export function radioGroupReducer<TValue>(
  state: RadioGroupState,
  transition: RadioGroupTransition,
  options: readonly ChoiceItem<TValue>[],
): RadioGroupState {
  return collectionInteractionReducer(state, transition, {
    index: createCollectionInteractionIndex(enabledIds(options, 'radioGroup')),
  });
}

export function normalizeRadioGroupState<TValue>(
  state: RadioGroupState,
  options: readonly ChoiceItem<TValue>[],
): RadioGroupState {
  return normalizeCollectionInteraction(
    state,
    createCollectionInteractionIndex(enabledIds(options, 'radioGroup')),
  );
}

export function colorSwatchPickerReducer<TValue>(
  state: ColorSwatchPickerState,
  transition: ColorSwatchPickerTransition,
  options: readonly ChoiceItem<TValue>[],
): ColorSwatchPickerState {
  return collectionInteractionReducer(state, transition, {
    index: createCollectionInteractionIndex(enabledIds(options, 'colorSwatchPicker')),
  });
}

export function normalizeColorSwatchPickerState<TValue>(
  state: ColorSwatchPickerState,
  options: readonly ChoiceItem<TValue>[],
): ColorSwatchPickerState {
  return normalizeCollectionInteraction(
    state,
    createCollectionInteractionIndex(enabledIds(options, 'colorSwatchPicker')),
  );
}

function enabledIds<TValue>(items: readonly ChoiceItem<TValue>[], context: string): readonly string[] {
  assertStableIds(items, (item) => item.id, context);
  return items.filter((item) => item.disabled !== true).map((item) => item.id);
}
