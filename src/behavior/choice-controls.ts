import type { ChoiceItem } from '../ui-model/contracts.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
  SelectAction,
  SelectPresentation
} from '../ui-model/choice-controls.ts';
import type { ColorSwatchPickerOption } from '../ui-model/forms.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import { adjacentItemId } from './navigation.ts';
import { resolveStableIds } from '../ui-model/identity.ts';

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
  const normalized = normalizeCheckboxGroupState(state, options);
  const enabled = enabledIds(options, 'checkboxGroup');
  let next: CheckboxGroupState;
  switch (action.kind) {
    case 'focus': next = enabled.includes(action.id) ? { ...normalized, focused: action.id } : normalized; break;
    case 'move': next = withFocused(normalized, adjacentId(enabled, normalized.focused, action.delta)); break;
    case 'first': next = withFocused(normalized, enabled[0]); break;
    case 'last': next = withFocused(normalized, enabled.at(-1)); break;
    case 'toggle':
      if (!enabled.includes(action.id)) return normalized;
      next = {
        selected: normalized.selected.includes(action.id)
          ? normalized.selected.filter((id) => id !== action.id)
          : [...normalized.selected, action.id],
        focused: action.id
      };
      break;
  }
  return normalizeCheckboxGroupState(next, options);
}

export function normalizeCheckboxGroupState<TValue>(
  state: CheckboxGroupState,
  options: readonly ChoiceItem<TValue>[]
): CheckboxGroupState {
  const enabled = enabledIds(options, 'checkboxGroup');
  const selectedInput = new Set(state.selected);
  const selected = enabled.filter((id) => selectedInput.has(id));
  const focused = state.focused !== undefined && enabled.includes(state.focused) ? state.focused : undefined;
  if (sameIds(state.selected, selected) && state.focused === focused) return state;
  return {
    selected,
    ...(focused === undefined ? {} : { focused })
  };
}

export function checkboxGroupPresentation<TValue>(
  state: CheckboxGroupState,
  options: readonly ChoiceItem<TValue>[]
): CheckboxGroupPresentation {
  const normalized = normalizeCheckboxGroupState(state, options);
  return {
    selected: normalized.selected,
    ...(normalized.focused === undefined ? {} : { focused: normalized.focused })
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
  const normalized = normalizeRadioGroupState(state, options);
  return normalizeRadioGroupState(
    reduceSingleChoice(normalized, action, enabledIds(options, 'radioGroup')),
    options
  );
}

export function normalizeRadioGroupState<TValue>(
  state: RadioGroupState,
  options: readonly ChoiceItem<TValue>[]
): RadioGroupState {
  return normalizeSingleChoice(state, enabledIds(options, 'radioGroup'));
}

export function radioGroupPresentation<TValue>(
  state: RadioGroupState,
  options: readonly ChoiceItem<TValue>[]
): RadioGroupPresentation {
  return compactSingleChoice(normalizeRadioGroupState(state, options));
}

export type SelectState = SelectPresentation;

export function selectReducer<TValue>(
  state: SelectState,
  action: SelectAction,
  options: readonly ChoiceItem<TValue>[]
): SelectState {
  const normalized = normalizeSelectState(state, options);
  const enabled = enabledIds(options, 'select');
  switch (action.kind) {
    case 'open': return normalized.kind === 'open' ? normalized : openSelect(normalized.selected, enabled);
    case 'close': return closedSelect(normalized.selected);
    case 'toggle': return normalized.kind === 'open' ? closedSelect(normalized.selected) : openSelect(normalized.selected, enabled);
    case 'dismiss': return closedSelect(normalized.selected);
    case 'highlight': return normalized.kind === 'open' && enabled.includes(action.id)
      ? withSelectHighlight(normalized, action.id, options)
      : normalized;
    case 'move': {
      if (normalized.kind === 'closed') return openSelect(normalized.selected, enabled, action.delta < 0 ? 'last' : 'first');
      const highlighted = adjacentId(enabled, normalized.highlighted ?? normalized.selected, action.delta);
      return highlighted === undefined ? normalized : withSelectHighlight(normalized, highlighted, options);
    }
    case 'first': {
      if (normalized.kind === 'closed') return openSelect(normalized.selected, enabled);
      const highlighted = enabled[0];
      return highlighted === undefined ? normalized : withSelectHighlight(normalized, highlighted, options);
    }
    case 'last': {
      if (normalized.kind === 'closed') return openSelect(normalized.selected, enabled);
      const highlighted = enabled.at(-1);
      return highlighted === undefined ? normalized : withSelectHighlight(normalized, highlighted, options);
    }
    case 'commit': return normalized.kind === 'open' && enabled.includes(action.id)
      ? { kind: 'closed', selected: action.id }
      : normalized;
    case 'scroll': return normalized.kind === 'open' && normalized.scroll !== undefined
      ? { ...normalized, scroll: applyScrollEvent(normalized.scroll, action.event) }
      : normalized;
  }
}

export function normalizeSelectState<TValue>(
  state: SelectState,
  options: readonly ChoiceItem<TValue>[]
): SelectState {
  const enabled = enabledIds(options, 'select');
  const selected = state.selected !== undefined && enabled.includes(state.selected) ? state.selected : undefined;
  if (state.kind === 'closed') return closedSelect(selected);
  const highlighted = state.highlighted !== undefined && enabled.includes(state.highlighted)
    ? state.highlighted
    : selected ?? enabled[0];
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'setContent', rows: options.length });
  if (state.selected === selected && state.highlighted === highlighted && state.scroll === scroll) return state;
  return {
    kind: 'open',
    ...(selected === undefined ? {} : { selected }),
    ...(highlighted === undefined ? {} : { highlighted }),
    ...(scroll === undefined ? {} : { scroll })
  };
}

export function selectPresentation<TValue>(
  state: SelectState,
  options: readonly ChoiceItem<TValue>[]
): SelectPresentation {
  const normalized = normalizeSelectState(state, options);
  return normalized.kind === 'closed'
    ? closedSelect(normalized.selected)
    : {
        kind: 'open',
        ...(normalized.selected === undefined ? {} : { selected: normalized.selected }),
        ...(normalized.highlighted === undefined ? {} : { highlighted: normalized.highlighted }),
        ...(normalized.scroll === undefined ? {} : { scroll: normalized.scroll })
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
  const normalized = normalizeColorSwatchPickerState(state, options);
  const enabled = enabledIds(options, 'colorSwatchPicker');
  let next: ColorSwatchPickerState;
  switch (action.kind) {
    case 'focus': next = enabled.includes(action.id) ? { ...normalized, focused: action.id } : normalized; break;
    case 'move': next = withFocused(normalized, adjacentId(enabled, normalized.focused ?? normalized.selected, action.delta)); break;
    case 'first': next = withFocused(normalized, enabled[0]); break;
    case 'last': next = withFocused(normalized, enabled.at(-1)); break;
    case 'select': next = enabled.includes(action.id) ? { selected: action.id, focused: action.id } : normalized; break;
  }
  return normalizeColorSwatchPickerState(next, options);
}

export function normalizeColorSwatchPickerState<TValue>(
  state: ColorSwatchPickerState,
  options: readonly ColorSwatchPickerOption<TValue>[]
): ColorSwatchPickerState {
  return normalizeSingleChoice(state, enabledIds(options, 'colorSwatchPicker'));
}

export function colorSwatchPickerPresentation<TValue>(
  state: ColorSwatchPickerState,
  options: readonly ColorSwatchPickerOption<TValue>[]
): ColorSwatchPickerPresentation {
  return compactSingleChoice(normalizeColorSwatchPickerState(state, options));
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

function enabledIds<TValue>(items: readonly ChoiceItem<TValue>[], context: string): readonly string[] {
  resolveStableIds(items, (item) => item.id, context);
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

function normalizeSingleChoice(state: SingleChoiceState, enabled: readonly string[]): SingleChoiceState {
  const selected = state.selected !== undefined && enabled.includes(state.selected) ? state.selected : undefined;
  const focused = state.focused !== undefined && enabled.includes(state.focused) ? state.focused : undefined;
  return state.selected === selected && state.focused === focused
    ? state
    : {
        ...(selected === undefined ? {} : { selected }),
        ...(focused === undefined ? {} : { focused })
      };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
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
    : scrollReducer(state.scroll, { kind: 'itemIntoView', itemIndex: index });
  return {
    ...state,
    highlighted,
    ...(scroll === undefined ? {} : { scroll })
  };
}
