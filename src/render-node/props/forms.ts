import type {
  ButtonOptions,
  CheckboxOptions,
  ColorPickerOption,
  DatePickerDay,
  FieldOptions,
  FormOptions,
  LabelOptions,
  NumberInputOptions,
  RangeSliderOptions,
  RangeSliderValue,
  SliderOptions,
  TextInputOptions,
  ToggleSwitchOptions
} from '../../components/options/forms.ts';
import type { ChoiceItem } from '../../components/contracts.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { AuthoredProps, ReplaceProps } from './shared.ts';

export type FormRenderProps = AuthoredProps<FormOptions>;
export type FieldRenderProps = AuthoredProps<FieldOptions>;
export type LabelRenderProps = AuthoredProps<LabelOptions>;

export type ButtonRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ButtonOptions>,
  'onPress',
  { readonly message?: TMessage }
>;

export type CheckboxRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<CheckboxOptions>,
  'onChange' | 'onTextPointer',
  {
    readonly message?: TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
>;

export type ToggleSwitchRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ToggleSwitchOptions>,
  'onChange',
  { readonly message?: TMessage }
>;

export type SliderRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<SliderOptions>,
  'onChange' | 'onStep',
  { readonly toMessage?: (value: number) => TMessage }
>;

export type RangeSliderRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<RangeSliderOptions>,
  'onChange' | 'onStep',
  { readonly toMessage?: (value: RangeSliderValue) => TMessage }
>;

interface ChoiceControlRenderProps {
  readonly label?: string;
  readonly options: readonly ChoiceItem<unknown>[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
}

export interface CheckboxListRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: readonly string[];
  readonly toMessage?: (option: ChoiceItem<unknown>, checked: boolean) => TMessage;
}

export interface RadioGroupRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: string;
  readonly toMessage?: (option: ChoiceItem<unknown>) => TMessage;
}

export interface SelectBoxRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: string;
  readonly toMessage?: (option: ChoiceItem<unknown>) => TMessage;
}

export interface ColorPickerRenderProps<TMessage> {
  readonly label?: string;
  readonly options: readonly ColorPickerOption<unknown>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toMessage?: (option: ColorPickerOption<unknown>) => TMessage;
}

export interface DatePickerRenderProps<TMessage> {
  readonly label?: string;
  readonly days: readonly DatePickerDay<unknown>[];
  readonly selected?: string;
  readonly columns?: number;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toMessage?: (day: DatePickerDay<unknown>) => TMessage;
}

export type TextInputRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<TextInputOptions>,
  'onSubmit' | 'onTextPointer' | 'onInput' | 'onPaste',
  {
    readonly message?: TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
> & { readonly value: string };

export type NumberInputRenderProps = Omit<
  AuthoredProps<NumberInputOptions>,
  'onInput' | 'onPaste'
>;
