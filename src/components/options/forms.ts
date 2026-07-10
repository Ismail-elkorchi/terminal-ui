import type { TextSelection } from '../../text/index.ts';
import type { TerminalStyle } from '../../tui/render-primitives.ts';
import type { LayoutFlowOptions } from '../../tui/regions.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ChoiceItem, ComponentTone } from '../contracts.ts';
import type { ComponentKeyBindings, ComponentOptions } from './base.ts';

export interface FormOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly title?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface FieldOptions<TMessage = never> extends ComponentOptions, LayoutFlowOptions {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface LabelOptions<TMessage = never> extends ComponentOptions {
  readonly text: string;
  readonly forId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type ButtonTone = Extract<ComponentTone, 'default' | 'primary' | 'secondary' | 'destructive'>;

export interface ButtonOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly onPress?: TMessage;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
  readonly pressed?: boolean;
  readonly pending?: boolean;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface CheckboxOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly onTextPointer?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ToggleSwitchOptions<TMessage = never> extends ComponentOptions {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly onChange?: (checked: boolean) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SliderOptions<TMessage = never> extends ComponentOptions {
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

export interface RangeSliderOptions<TMessage = never> extends ComponentOptions {
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

export interface CheckboxListOptions<TValue = string, TMessage = never> extends ComponentOptions {
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

export interface ColorPickerOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ColorPickerOption<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly onChange?: (option: ColorPickerOption<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface DatePickerDay<TValue = string> extends ChoiceItem<TValue> {
  readonly today?: boolean;
  readonly outsideMonth?: boolean;
}

export interface DatePickerOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly days: readonly DatePickerDay<TValue>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly onChange?: (day: DatePickerDay<TValue>) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface RadioGroupOptions<TValue = string, TMessage = never> extends ComponentOptions {
  readonly label?: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly onChange?: (option: ChoiceItem<TValue>) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SelectBoxOptions<TValue = string, TMessage = never> extends ComponentOptions {
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

export interface TextInputOptions<TMessage = never> extends ComponentOptions {
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
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}

export interface NumberInputOptions<TMessage = never> extends ComponentOptions {
  readonly value?: number;
  readonly cursor?: number;
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}
