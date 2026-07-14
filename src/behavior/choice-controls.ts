import type { ChoiceItem } from '../ui-model/contracts.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
  SelectAction
} from '../ui-model/choice-controls.ts';
import type { ColorSwatchPickerOption } from '../ui-model/forms.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
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

export type SelectState = SelectPresentation;

export type SelectPresentation =
  | { readonly kind: 'closed'; readonly selected?: string }
  | {
      readonly kind: 'open';
      readonly selected?: string;
      readonly highlighted?: string;
      readonly scroll?: ScrollState;
    };

export function selectReducer<TValue>(
  state: SelectState,
  action: SelectAction,
  options: readonly ChoiceItem<TValue>[]
): SelectState {
  const enabled = enabledIds(options);
  switch (action.kind) {
    case 'open': return state.kind === 'open' ? state : openSelect(state.selected, enabled);
    case 'close': return closedSelect(state.selected);
    case 'toggle': return state.kind === 'open' ? closedSelect(state.selected) : openSelect(state.selected, enabled);
    case 'dismiss': return closedSelect(state.selected);
    case 'highlight': return state.kind === 'open' && enabled.includes(action.id)
      ? withSelectHighlight(state, action.id, options)
      : state;
    case 'move': {
      if (state.kind === 'closed') return openSelect(state.selected, enabled, action.delta < 0 ? 'last' : 'first');
      const highlighted = adjacentId(enabled, state.highlighted ?? state.selected, action.delta);
      return highlighted === undefined ? state : withSelectHighlight(state, highlighted, options);
    }
    case 'first': {
      if (state.kind === 'closed') return openSelect(state.selected, enabled);
      const highlighted = enabled[0];
      return highlighted === undefined ? state : withSelectHighlight(state, highlighted, options);
    }
    case 'last': {
      if (state.kind === 'closed') return openSelect(state.selected, enabled);
      const highlighted = enabled.at(-1);
      return highlighted === undefined ? state : withSelectHighlight(state, highlighted, options);
    }
    case 'commit': return state.kind === 'open' && enabled.includes(action.id)
      ? { kind: 'closed', selected: action.id }
      : state;
    case 'scroll': return state.kind === 'open' && state.scroll !== undefined
      ? { ...state, scroll: applyScrollEvent(state.scroll, action.event) }
      : state;
  }
}

export function selectPresentation(state: SelectState): SelectPresentation {
  return state.kind === 'closed'
    ? closedSelect(state.selected)
    : {
        kind: 'open',
        ...(state.selected === undefined ? {} : { selected: state.selected }),
        ...(state.highlighted === undefined ? {} : { highlighted: state.highlighted }),
        ...(state.scroll === undefined ? {} : { scroll: state.scroll })
      };
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
  action: RadioGroupAction,
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

function openSelect(
  selected: string | undefined,
  enabled: readonly string[],
  fallback: 'first' | 'last' = 'first'
): SelectPresentation {
  const highlighted = selected !== undefined && enabled.includes(selected)
    ? selected
    : fallback === 'last' ? enabled.at(-1) : enabled[0];
  return {
    kind: 'open',
    ...(selected === undefined ? {} : { selected }),
    ...(highlighted === undefined ? {} : { highlighted })
  };
}

function closedSelect(selected: string | undefined): SelectPresentation {
  return selected === undefined ? { kind: 'closed' } : { kind: 'closed', selected };
}

function withSelectHighlight<TValue>(
  state: Extract<SelectPresentation, { readonly kind: 'open' }>,
  highlighted: string,
  options: readonly ChoiceItem<TValue>[]
): SelectPresentation {
  const index = options.findIndex((option) => option.id === highlighted);
  const scroll = state.scroll === undefined || index < 0
    ? state.scroll
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index });
  return {
    ...state,
    highlighted,
    ...(scroll === undefined ? {} : { scroll })
  };
}
