import type { TextSelection } from '../../../text/index.ts';
import type { TextPointerEvent } from '../../../interaction/text-pointer.ts';
import type { ChoiceItem } from '../../../ui-model/contracts.ts';
import type {
  ButtonState,
  ButtonTone,
  ColorPickerOption,
  NumericRange,
  RangeSliderValue
} from '../../../ui-model/forms.ts';
import type { NumberInputAction, NumberInputPresentation } from '../../../ui-model/number-input.ts';
import type { DatePickerAction, DatePickerDay } from '../../../ui-model/date-picker.ts';
import type {
  CheckboxListAction,
  ColorPickerAction,
  RadioGroupAction,
  SelectBoxAction
} from '../../../ui-model/choice-controls.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';

export interface FormRenderProps extends RenderNodeLayoutProps {
  readonly title?: string;
}

export interface FieldRenderProps extends RenderNodeLayoutProps {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface LabelRenderProps {
  readonly text: string;
  readonly forId?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface ButtonRenderProps<TMessage> {
  readonly label: string;
  readonly message?: TMessage;
  readonly state?: ButtonState;
  readonly tone?: ButtonTone;
}

export interface CheckboxRenderProps<TMessage> {
  readonly label: string;
  readonly checked: boolean;
  readonly toMessage?: (checked: boolean) => TMessage;
  readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
}

export interface ToggleSwitchRenderProps<TMessage> {
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly toMessage?: (checked: boolean) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
}

export interface SliderRenderProps<TMessage> {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly toMessage?: (value: number) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
}

export interface RangeSliderRenderProps<TMessage> {
  readonly label?: string;
  readonly value: RangeSliderValue;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly toMessage?: (value: RangeSliderValue) => TMessage;
  readonly disabled?: boolean;
  readonly error?: string;
}

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

export interface TextInputRenderProps<TMessage> {
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly message?: TMessage;
  readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
}

export interface NumberInputRenderProps<TMessage> {
  readonly presentation: NumberInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toActionMessage?: (action: NumberInputAction) => TMessage;
}
