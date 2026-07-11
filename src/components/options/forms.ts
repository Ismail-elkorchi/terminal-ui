import type { TextEditOperation, TextSelection } from '../../text/index.ts';
import type { TerminalStyle } from '../../tui/render-primitives.ts';
import type { LayoutFlowOptions } from '../../layout/geometry.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ChoiceItem, ComponentTone } from '../contracts.ts';
import type { NumberInputAction, NumberInputValidity } from '../number-input.ts';
import type { DatePickerAction, DatePickerDay } from '../date-picker.ts';
import type { ComponentKeyBindings, ComponentOptions, InteractiveComponentOptions } from './base.ts';
import type {
  ButtonStylePart,
  ChoiceStylePart,
  FormGroupStylePart,
  NumberInputStylePart,
  PickerStylePart,
  SliderStylePart,
  TextEntryStylePart,
  ToggleStylePart
} from '../style-parts.ts';

export interface FormOptions extends ComponentOptions<FormGroupStylePart>, LayoutFlowOptions {
  readonly title?: string;
}

export interface FieldOptions extends ComponentOptions<FormGroupStylePart>, LayoutFlowOptions {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface LabelOptions extends ComponentOptions<FormGroupStylePart> {
  readonly text: string;
  readonly forId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export type ButtonTone = Extract<ComponentTone, 'default' | 'primary' | 'secondary' | 'destructive'>;

export interface ButtonOptions<TMessage = never> extends InteractiveComponentOptions<ButtonStylePart> {
  readonly label: string;
  readonly onPress?: TMessage;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
  readonly pressed?: boolean;
  readonly pending?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface CheckboxOptions<TMessage = never> extends InteractiveComponentOptions<ChoiceStylePart> {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ToggleSwitchOptions<TMessage = never> extends InteractiveComponentOptions<ToggleStylePart> {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SliderOptions<TMessage = never> extends InteractiveComponentOptions<SliderStylePart> {
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
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type SliderStepDirection = 'decrement' | 'increment';

export interface SliderStepEvent {
  readonly direction: SliderStepDirection;
}

export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface RangeSliderOptions<TMessage = never> extends InteractiveComponentOptions<SliderStylePart> {
  readonly label?: string;
  readonly start: number;
  readonly end: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly onChange?: (value: RangeSliderValue) => TMessage;
  readonly onStep?: (event: RangeSliderStepEvent) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RangeSliderStepEvent {
  readonly handle: 'start' | 'end';
  readonly direction: SliderStepDirection;
}

export interface CheckboxListOptions<TValue = string, TMessage = never> extends InteractiveComponentOptions<ChoiceStylePart> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: readonly string[];
  readonly onChange?: (option: ChoiceItem<TValue>, checked: boolean) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ColorPickerOption<TValue = string> extends ChoiceItem<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}

export interface ColorPickerOptions<TValue = string, TMessage = never> extends InteractiveComponentOptions<PickerStylePart> {
  readonly label?: string;
  readonly options: readonly ColorPickerOption<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly onChange?: (option: ColorPickerOption<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface DatePickerOptions<TMessage = never> extends InteractiveComponentOptions<PickerStylePart> {
  readonly label?: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly DatePickerDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly onAction?: (action: DatePickerAction) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RadioGroupOptions<TValue = string, TMessage = never> extends InteractiveComponentOptions<ChoiceStylePart> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly onChange?: (option: ChoiceItem<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SelectBoxOptions<TValue = string, TMessage = never> extends InteractiveComponentOptions<ChoiceStylePart> {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly placeholder?: string;
  readonly onChange?: (option: ChoiceItem<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface TextInputOptions<TMessage = never> extends InteractiveComponentOptions<TextEntryStylePart> {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly onSubmit?: TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
  readonly onEdit?: (operation: TextEditOperation) => TMessage;
}

export interface NumberInputOptions<TMessage = never> extends InteractiveComponentOptions<NumberInputStylePart> {
  readonly value?: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly committedValue?: number;
  readonly parsedValue?: number;
  readonly validity?: NumberInputValidity;
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onAction?: (action: NumberInputAction) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}
