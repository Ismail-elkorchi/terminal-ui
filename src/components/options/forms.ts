import type { InlineContent } from '../../visual/inline-content.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type {
  ButtonTone,
  ColorSwatchPickerOption,
  NumericRange
} from '../../ui-model/forms.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
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
}

export interface LabelOptions extends ElementOptions<FormGroupStylePart> {
  readonly id: string;
  readonly text: string;
  readonly forId: string;
}

interface ButtonOptionsBase extends ElementOptions<ButtonStylePart> {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly busy?: boolean;
}

export type ButtonOptions<TMessage = never> =
  | ActiveButtonOptions<TMessage>
  | InactiveButtonOptions;

export interface ActiveButtonOptions<TMessage>
  extends ButtonOptionsBase, InteractiveElementOptions<ButtonStylePart, TMessage> {
  readonly onPress: () => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type InactiveButtonOptions = ButtonOptionsBase & {
  readonly onPress?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface CheckboxOptionsBase extends ElementOptions<ChoiceStylePart> {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly required?: boolean;
  readonly error?: string;
}

export type CheckboxOptions<TMessage = never> =
  | ActiveCheckboxOptions<TMessage>
  | DisabledCheckboxOptions;

export interface ActiveCheckboxOptions<TMessage>
  extends CheckboxOptionsBase, InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly onChange: (checked: boolean) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledCheckboxOptions = CheckboxOptionsBase & {
  readonly onChange?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface ToggleSwitchOptionsBase extends ElementOptions<ToggleStylePart> {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly error?: string;
}

export type ToggleSwitchOptions<TMessage = never> =
  | ActiveToggleSwitchOptions<TMessage>
  | DisabledToggleSwitchOptions;

export interface ActiveToggleSwitchOptions<TMessage>
  extends ToggleSwitchOptionsBase, InteractiveElementOptions<ToggleStylePart, TMessage> {
  readonly onChange: (checked: boolean) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledToggleSwitchOptions = ToggleSwitchOptionsBase & {
  readonly onChange?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface SliderOptionsBase extends ElementOptions<SliderStylePart> {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly error?: string;
}

export type SliderOptions<TMessage = never> =
  | ActiveSliderOptions<TMessage>
  | DisabledSliderOptions;

export interface ActiveSliderOptions<TMessage>
  extends SliderOptionsBase, InteractiveElementOptions<SliderStylePart, TMessage> {
  readonly onChange: (value: number) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledSliderOptions = SliderOptionsBase & {
  readonly onChange?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface RangeSliderOptionsBase extends ElementOptions<SliderStylePart> {
  readonly id: string;
  readonly label: string;
  readonly state: RangeSliderState;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly error?: string;
}

export type RangeSliderOptions<TMessage = never> =
  | ActiveRangeSliderOptions<TMessage>
  | DisabledRangeSliderOptions;

export interface ActiveRangeSliderOptions<TMessage>
  extends RangeSliderOptionsBase, InteractiveElementOptions<SliderStylePart, TMessage> {
  readonly onAction: (action: RangeSliderAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledRangeSliderOptions = RangeSliderOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface CheckboxGroupOptionsBase<TValue> extends ElementOptions<ChoiceStylePart> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: readonly string[];
  readonly focused?: string;
  readonly required?: boolean;
  readonly error?: string;
}

export type CheckboxGroupOptions<TValue = string, TMessage = never> =
  | ActiveCheckboxGroupOptions<TValue, TMessage>
  | DisabledCheckboxGroupOptions<TValue>;

export interface ActiveCheckboxGroupOptions<TValue, TMessage>
  extends CheckboxGroupOptionsBase<TValue>, InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly onAction: (action: CheckboxGroupAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledCheckboxGroupOptions<TValue> = CheckboxGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface ColorSwatchPickerOptionsBase<TValue> extends ElementOptions<PickerStylePart> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ColorSwatchPickerOption<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly columns?: number;
  readonly error?: string;
}

export type ColorSwatchPickerOptions<TValue = string, TMessage = never> =
  | ActiveColorSwatchPickerOptions<TValue, TMessage>
  | DisabledColorSwatchPickerOptions<TValue>;

export interface ActiveColorSwatchPickerOptions<TValue, TMessage>
  extends ColorSwatchPickerOptionsBase<TValue>, InteractiveElementOptions<PickerStylePart, TMessage> {
  readonly onAction: (action: ColorSwatchPickerAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledColorSwatchPickerOptions<TValue> = ColorSwatchPickerOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface CalendarOptionsBase extends ElementOptions<PickerStylePart> {
  readonly id: string;
  readonly label: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly error?: string;
}

export type CalendarOptions<TMessage = never> =
  | ActiveCalendarOptions<TMessage>
  | DisabledCalendarOptions;

export interface ActiveCalendarOptions<TMessage>
  extends CalendarOptionsBase, InteractiveElementOptions<PickerStylePart, TMessage> {
  readonly onAction: (action: CalendarAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledCalendarOptions = CalendarOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface RadioGroupOptionsBase<TValue> extends ElementOptions<ChoiceStylePart> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly required?: boolean;
  readonly error?: string;
}

export type RadioGroupOptions<TValue = string, TMessage = never> =
  | ActiveRadioGroupOptions<TValue, TMessage>
  | DisabledRadioGroupOptions<TValue>;

export interface ActiveRadioGroupOptions<TValue, TMessage>
  extends RadioGroupOptionsBase<TValue>, InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly onAction: (action: RadioGroupAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledRadioGroupOptions<TValue> = RadioGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface SelectOptionsBase<TValue> extends ElementOptions<ChoiceStylePart> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly required?: boolean;
  readonly error?: string;
}

export type SelectOptions<TValue = string, TMessage = never> =
  | ActiveSelectOptions<TValue, TMessage>
  | DisabledSelectOptions<TValue>;

export interface ActiveSelectOptions<TValue, TMessage>
  extends SelectOptionsBase<TValue>, InteractiveElementOptions<ChoiceStylePart, TMessage> {
  readonly presentation: SelectPresentation;
  readonly onAction: (action: SelectAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledSelectOptions<TValue> = SelectOptionsBase<TValue> & {
  readonly presentation: Extract<SelectPresentation, { readonly kind: 'closed' }>;
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

interface TextInputOptionsBase extends ElementOptions<TextEntryStylePart> {
  readonly id: string;
  readonly presentation: TextInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
}

export type TextInputOptions<TMessage = never> =
  | ActiveTextInputOptions<TMessage>
  | DisabledTextInputOptions;

export type ActiveTextInputOptions<TMessage> =
  & TextInputOptionsBase
  & InteractiveElementOptions<TextEntryStylePart, TMessage>
  & {
      readonly disabled?: false;
      readonly keys?: ElementKeyBindings<TMessage>;
    }
  & (
    | {
        readonly onAction: (action: TextInputAction) => TMessage;
        readonly onSubmit?: (value: string) => TMessage;
      }
    | {
        readonly onAction?: never;
        readonly onSubmit: (value: string) => TMessage;
      }
  );

export type DisabledTextInputOptions = TextInputOptionsBase & {
  readonly onAction?: never;
  readonly onSubmit?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

export type PasswordInputOptions<TMessage = never> =
  (ActiveTextInputOptions<TMessage> | DisabledTextInputOptions) & { readonly mask?: string };

interface NumberInputOptionsBase extends ElementOptions<NumberInputStylePart> {
  readonly id: string;
  readonly presentation: NumberInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
}

export type NumberInputOptions<TMessage = never> =
  | ActiveNumberInputOptions<TMessage>
  | DisabledNumberInputOptions;

export interface ActiveNumberInputOptions<TMessage>
  extends NumberInputOptionsBase, InteractiveElementOptions<NumberInputStylePart, TMessage> {
  readonly onAction: (action: NumberInputControlAction) => TMessage;
  readonly disabled?: false;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DisabledNumberInputOptions = NumberInputOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly keys?: never;
  readonly pointer?: never;
};

export type {
  ButtonTone,
  ColorSwatchPickerOption,
  NumericRange,
  RangeSliderValue,
  SliderStepDirection
} from '../../ui-model/forms.ts';
export type { RangeSliderState } from '../../ui-model/range-slider.ts';
export type { SelectPresentation } from '../../ui-model/choice-controls.ts';
