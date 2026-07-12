import type {
  ButtonOptions,
  CheckboxOptions,
  ColorPickerOption,
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
import type { NumberInputAction } from '../../components/number-input.ts';
import type { DatePickerAction, DatePickerDay } from '../../components/date-picker.ts';
import type {
  CheckboxListAction,
  ColorPickerAction,
  RadioGroupAction,
  SelectBoxAction
} from '../../components/choice-controls.ts';
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
    readonly toMessage?: (checked: boolean) => TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
>;

export type ToggleSwitchRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ToggleSwitchOptions>,
  'onChange',
  { readonly toMessage?: (checked: boolean) => TMessage }
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
  readonly focused?: string;
  readonly toActionMessage?: (action: CheckboxListAction) => TMessage;
}

export interface RadioGroupRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: string;
  readonly focused?: string;
  readonly toActionMessage?: (action: RadioGroupAction) => TMessage;
}

export interface SelectBoxRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: string;
  readonly focused?: string;
  readonly toActionMessage?: (action: SelectBoxAction) => TMessage;
}

export interface ColorPickerRenderProps<TMessage> {
  readonly label?: string;
  readonly options: readonly ColorPickerOption<unknown>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly columns?: number;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toActionMessage?: (action: ColorPickerAction) => TMessage;
}

export interface DatePickerRenderProps<TMessage> {
  readonly label?: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly DatePickerDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toMessage?: (day: DatePickerDay) => TMessage;
  readonly toActionMessage?: (action: DatePickerAction) => TMessage;
}

export type TextInputRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<TextInputOptions>,
  'onSubmit' | 'onTextPointer' | 'onEdit',
  {
    readonly message?: TMessage;
    readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  }
> & { readonly value: string };

export type NumberInputRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<NumberInputOptions>,
  'onAction',
  { readonly toActionMessage?: (action: NumberInputAction) => TMessage }
> & { readonly value: string };
