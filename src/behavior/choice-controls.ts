import type { ChoiceItem } from '../ui-model/contracts.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
} from '../ui-model/choice-controls.ts';
import type { ColorSwatchPickerOption } from '../ui-model/forms.ts';
import {
  collectionInteractionReducer,
  normalizeCollectionInteraction,
  prepareCollectionInteractionIndex,
} from '../interaction/collection.ts';
import type { CollectionInteractionState } from '../interaction/collection.ts';
import { assertStableIds } from '../ui-model/identity.ts';

export type CheckboxGroupState = CollectionInteractionState;
export type RadioGroupState = CollectionInteractionState;
export type ColorSwatchPickerState = CollectionInteractionState;

export function checkboxGroupReducer<TValue>(
  state: CheckboxGroupState,
  action: CheckboxGroupAction,
  options: readonly ChoiceItem<TValue>[],
): CheckboxGroupState {
  return collectionInteractionReducer(state, action, {
    index: prepareCollectionInteractionIndex(enabledIds(options, 'checkboxGroup')),
  });
}

export function normalizeCheckboxGroupState<TValue>(
  state: CheckboxGroupState,
  options: readonly ChoiceItem<TValue>[],
): CheckboxGroupState {
  return normalizeCollectionInteraction(
    state,
    prepareCollectionInteractionIndex(enabledIds(options, 'checkboxGroup')),
  );
}

export function checkboxGroupPresentation<TValue>(
  state: CheckboxGroupState,
  options: readonly ChoiceItem<TValue>[],
): CheckboxGroupState {
  return normalizeCheckboxGroupState(state, options);
}

export function radioGroupReducer<TValue>(
  state: RadioGroupState,
  action: RadioGroupAction,
  options: readonly ChoiceItem<TValue>[],
): RadioGroupState {
  return collectionInteractionReducer(state, action, {
    index: prepareCollectionInteractionIndex(enabledIds(options, 'radioGroup')),
  });
}

export function normalizeRadioGroupState<TValue>(
  state: RadioGroupState,
  options: readonly ChoiceItem<TValue>[],
): RadioGroupState {
  return normalizeCollectionInteraction(
    state,
    prepareCollectionInteractionIndex(enabledIds(options, 'radioGroup')),
  );
}

export function radioGroupPresentation<TValue>(
  state: RadioGroupState,
  options: readonly ChoiceItem<TValue>[],
): RadioGroupState {
  return normalizeRadioGroupState(state, options);
}

export function colorSwatchPickerReducer<TValue>(
  state: ColorSwatchPickerState,
  action: ColorSwatchPickerAction,
  options: readonly ColorSwatchPickerOption<TValue>[],
): ColorSwatchPickerState {
  return collectionInteractionReducer(state, action, {
    index: prepareCollectionInteractionIndex(enabledIds(options, 'colorSwatchPicker')),
  });
}

export function normalizeColorSwatchPickerState<TValue>(
  state: ColorSwatchPickerState,
  options: readonly ColorSwatchPickerOption<TValue>[],
): ColorSwatchPickerState {
  return normalizeCollectionInteraction(
    state,
    prepareCollectionInteractionIndex(enabledIds(options, 'colorSwatchPicker')),
  );
}

export function colorSwatchPickerPresentation<TValue>(
  state: ColorSwatchPickerState,
  options: readonly ColorSwatchPickerOption<TValue>[],
): ColorSwatchPickerState {
  return normalizeColorSwatchPickerState(state, options);
}

function enabledIds<TValue>(items: readonly ChoiceItem<TValue>[], context: string): readonly string[] {
  assertStableIds(items, (item) => item.id, context);
  return items.filter((item) => item.disabled !== true).map((item) => item.id);
}
