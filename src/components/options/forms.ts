import type { InlineContent } from '../../visual/inline-content.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type {
  ButtonState,
  ButtonTone,
  ColorSwatchPickerOption,
  NumericRange,
  SliderStepEvent
} from '../../ui-model/forms.ts';
import type { NumberInputControlAction, NumberInputPresentation } from '../../ui-model/number-input.ts';
import type { TextInputAction, TextInputPresentation } from '../../ui-model/text-input.ts';
import type { CalendarAction, CalendarDay } from '../../ui-model/calendar.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
  SelectAction
} from '../../ui-model/choice-controls.ts';
import type { RangeSliderAction, RangeSliderState } from '../../ui-model/range-slider.ts';
import type { SelectPresentation } from '../../ui-model/choice-controls.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  ButtonStylePart,
  ChoiceStylePart,
  FormGroupStylePart,
  NumberInputStylePart,
  PickerStylePart,
  SliderStylePart,
  TextEntryStylePart,
  ToggleStylePart
} from '../../ui-model/style-parts.ts';

export interface FormOptions extends ElementOptions<FormGroupStylePart>, LayoutFlowOptions {
  readonly title?: string;
}

export interface FieldOptions extends ElementOptions<FormGroupStylePart>, LayoutFlowOptions {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface LabelOptions extends ElementOptions<FormGroupStylePart> {
  readonly id: string;
  readonly text: string;
  readonly forId: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface ButtonOptions<TMessage = never> extends InteractiveElementOptions<ButtonStylePart, TMessage> {
  readonly label: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly onPress?: () => TMessage;
  readonly state?: ButtonState;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface CheckboxOptions<TMessage = never> extends InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ToggleSwitchOptions<TMessage = never> extends InteractiveElementOptions<ToggleStylePart, TMessage> {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SliderOptions<TMessage = never> extends InteractiveElementOptions<SliderStylePart, TMessage> {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly onChange?: (value: number) => TMessage;
  readonly onStep?: (event: SliderStepEvent) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface RangeSliderOptions<TMessage = never> extends InteractiveElementOptions<SliderStylePart, TMessage> {
  readonly label?: string;
  readonly state: RangeSliderState;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly onAction?: (action: RangeSliderAction) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface CheckboxGroupOptions<TValue = string, TMessage = never> extends InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: readonly string[];
  readonly focused?: string;
  readonly onAction?: (action: CheckboxGroupAction) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ColorSwatchPickerOptions<TValue = string, TMessage = never> extends InteractiveElementOptions<PickerStylePart, TMessage> {
  readonly label?: string;
  readonly options: readonly ColorSwatchPickerOption<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly columns?: number;
  readonly onAction?: (action: ColorSwatchPickerAction) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface CalendarOptions<TMessage = never> extends InteractiveElementOptions<PickerStylePart, TMessage> {
  readonly label?: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly onAction?: (action: CalendarAction) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface RadioGroupOptions<TValue = string, TMessage = never> extends InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly onAction?: (action: RadioGroupAction) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SelectOptions<TValue = string, TMessage = never> extends InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly presentation: SelectPresentation;
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly onAction?: (action: SelectAction) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface TextInputOptions<TMessage = never> extends InteractiveElementOptions<TextEntryStylePart, TMessage> {
  readonly presentation: TextInputPresentation;
  readonly placeholder?: string;
  readonly onSubmit?: (value: string) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ElementKeyBindings<TMessage>;
  readonly onAction?: (action: TextInputAction) => TMessage;
}

export interface PasswordInputOptions<TMessage = never> extends TextInputOptions<TMessage> {
  readonly mask?: string;
}

export interface NumberInputOptions<TMessage = never> extends InteractiveElementOptions<NumberInputStylePart, TMessage> {
  readonly presentation: NumberInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onAction?: (action: NumberInputControlAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type {
  ButtonState,
  ButtonTone,
  ColorSwatchPickerOption,
  NumericRange,
  RangeSliderValue,
  SliderStepDirection,
  SliderStepEvent
} from '../../ui-model/forms.ts';
export type { RangeSliderState } from '../../ui-model/range-slider.ts';
export type { SelectPresentation } from '../../ui-model/choice-controls.ts';
