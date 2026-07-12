import type { ChoiceItem } from '../components/contracts.ts';
import type {
  CheckboxListAction,
  ColorPickerAction,
  RadioGroupAction,
  SelectBoxAction
} from '../components/choice-controls.ts';
import type { ColorPickerOption } from '../components/options/forms.ts';

export interface CheckboxListState {
  readonly selected: readonly string[];
  readonly focused?: string;
}

export interface CheckboxListPresentation {
  readonly selected: readonly string[];
  readonly focused?: string;
}

export function checkboxListReducer<TValue>(
  state: CheckboxListState,
  action: CheckboxListAction,
  options: readonly ChoiceItem<TValue>[]
): CheckboxListState {
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

export function checkboxListPresentation(state: CheckboxListState): CheckboxListPresentation {
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

export interface SelectBoxState {
  readonly selected?: string;
  readonly focused?: string;
}

export type SelectBoxPresentation = SelectBoxState;

export function selectBoxReducer<TValue>(
  state: SelectBoxState,
  action: SelectBoxAction,
  options: readonly ChoiceItem<TValue>[]
): SelectBoxState {
  return reduceSingleChoice(state, action, enabledIds(options));
}

export function selectBoxPresentation(state: SelectBoxState): SelectBoxPresentation {
  return compactSingleChoice(state);
}

export interface ColorPickerState {
  readonly selected?: string;
  readonly focused?: string;
}

export type ColorPickerPresentation = ColorPickerState;

export function colorPickerReducer<TValue>(
  state: ColorPickerState,
  action: ColorPickerAction,
  options: readonly ColorPickerOption<TValue>[]
): ColorPickerState {
  const enabled = enabledIds(options);
  switch (action.kind) {
    case 'focus': return enabled.includes(action.id) ? { ...state, focused: action.id } : state;
    case 'move': return withFocused(state, adjacentId(enabled, state.focused ?? state.selected, action.delta));
    case 'first': return withFocused(state, enabled[0]);
    case 'last': return withFocused(state, enabled.at(-1));
    case 'select': return enabled.includes(action.id) ? { selected: action.id, focused: action.id } : state;
  }
}

export function colorPickerPresentation(state: ColorPickerState): ColorPickerPresentation {
  return compactSingleChoice(state);
}

interface SingleChoiceState {
  readonly selected?: string;
  readonly focused?: string;
}

function reduceSingleChoice(
  state: SingleChoiceState,
  action: RadioGroupAction | SelectBoxAction,
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
  if (ids.length === 0) return undefined;
  const index = Math.max(0, ids.indexOf(current ?? ''));
  return ids[wrapIndex(index + delta, ids.length)];
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

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}
