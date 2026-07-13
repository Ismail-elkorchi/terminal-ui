import type { ChoiceItem } from '../ui-model/contracts.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
  SelectAction
} from '../ui-model/choice-controls.ts';
import type { ColorSwatchPickerOption } from '../ui-model/forms.ts';
import { adjacentItemId } from './navigation.ts';

export interface CheckboxGroupState {
  readonly selected: readonly string[];
  readonly focused?: string;
}

export interface CheckboxGroupPresentation {
  readonly selected: readonly string[];
  readonly focused?: string;
}

export function checkboxGroupReducer<TValue>(
  state: CheckboxGroupState,
  action: CheckboxGroupAction,
  options: readonly ChoiceItem<TValue>[]
): CheckboxGroupState {
  const enabled = enabledIds(options);
  switch (action.kind) {
    case 'focus': return enabled.includes(action.id) ? { ...state, focused: action.id } : state;
    case 'move': return withFocused(state, adjacentId(enabled, state.focused, action.delta));
    case 'first': return withFocused(state, enabled[0]);
    case 'last': return withFocused(state, enabled.at(-1));
    case 'toggle':
      if (!enabled.includes(action.id)) return state;
      return {
        selected: state.selected.includes(action.id)
          ? state.selected.filter((id) => id !== action.id)
          : [...state.selected, action.id],
        focused: action.id
      };
  }
}

export function checkboxGroupPresentation(state: CheckboxGroupState): CheckboxGroupPresentation {
  return {
    selected: state.selected,
    ...(state.focused === undefined ? {} : { focused: state.focused })
  };
}

export interface RadioGroupState {
  readonly selected?: string;
  readonly focused?: string;
}

export type RadioGroupPresentation = RadioGroupState;

export function radioGroupReducer<TValue>(
  state: RadioGroupState,
  action: RadioGroupAction,
  options: readonly ChoiceItem<TValue>[]
): RadioGroupState {
  return reduceSingleChoice(state, action, enabledIds(options));
}

export function radioGroupPresentation(state: RadioGroupState): RadioGroupPresentation {
  return compactSingleChoice(state);
}

export interface SelectState {
  readonly selected?: string;
  readonly focused?: string;
}

export type SelectPresentation = SelectState;

export function selectReducer<TValue>(
  state: SelectState,
  action: SelectAction,
  options: readonly ChoiceItem<TValue>[]
): SelectState {
  return reduceSingleChoice(state, action, enabledIds(options));
}

export function selectPresentation(state: SelectState): SelectPresentation {
  return compactSingleChoice(state);
}

export interface ColorSwatchPickerState {
  readonly selected?: string;
  readonly focused?: string;
}

export type ColorSwatchPickerPresentation = ColorSwatchPickerState;

export function colorSwatchPickerReducer<TValue>(
  state: ColorSwatchPickerState,
  action: ColorSwatchPickerAction,
  options: readonly ColorSwatchPickerOption<TValue>[]
): ColorSwatchPickerState {
  const enabled = enabledIds(options);
  switch (action.kind) {
    case 'focus': return enabled.includes(action.id) ? { ...state, focused: action.id } : state;
    case 'move': return withFocused(state, adjacentId(enabled, state.focused ?? state.selected, action.delta));
    case 'first': return withFocused(state, enabled[0]);
    case 'last': return withFocused(state, enabled.at(-1));
    case 'select': return enabled.includes(action.id) ? { selected: action.id, focused: action.id } : state;
  }
}

export function colorSwatchPickerPresentation(state: ColorSwatchPickerState): ColorSwatchPickerPresentation {
  return compactSingleChoice(state);
}

interface SingleChoiceState {
  readonly selected?: string;
  readonly focused?: string;
}

function reduceSingleChoice(
  state: SingleChoiceState,
  action: RadioGroupAction | SelectAction,
  enabled: readonly string[]
): SingleChoiceState {
  switch (action.kind) {
    case 'focus': return enabled.includes(action.id) ? { ...state, focused: action.id } : state;
    case 'move': return withFocused(state, adjacentId(enabled, state.focused ?? state.selected, action.delta));
    case 'first': return withFocused(state, enabled[0]);
    case 'last': return withFocused(state, enabled.at(-1));
    case 'select': return enabled.includes(action.id) ? { selected: action.id, focused: action.id } : state;
  }
}

function enabledIds<TValue>(items: readonly ChoiceItem<TValue>[]): readonly string[] {
  return items.filter((item) => item.disabled !== true).map((item) => item.id);
}

function adjacentId(ids: readonly string[], current: string | undefined, delta: number): string | undefined {
  return adjacentItemId(ids, current, delta);
}

function withFocused<TState extends { readonly focused?: string }>(state: TState, focused: string | undefined): TState | TState & { readonly focused: string } {
  return focused === undefined ? state : { ...state, focused };
}

function compactSingleChoice(state: SingleChoiceState): SingleChoiceState {
  return {
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.focused === undefined ? {} : { focused: state.focused })
  };
}
