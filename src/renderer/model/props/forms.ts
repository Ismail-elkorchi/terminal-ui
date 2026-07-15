import type { TextSelection } from '../../../text/index.ts';
import type { AnchoredSurfacePlacement } from '../../../interaction/anchored-surface.ts';
import type { ChoiceItem } from '../../../ui-model/contracts.ts';
import type {
  ButtonState,
  ButtonTone,
  ColorSwatchPickerOption,
  NumericRange
} from '../../../ui-model/forms.ts';
import type { RangeSliderAction, RangeSliderPresentation } from '../../../ui-model/range-slider.ts';
import type { NumberInputAction, NumberInputPresentation } from '../../../ui-model/number-input.ts';
import type { CalendarAction, CalendarDay } from '../../../ui-model/calendar.ts';
import type {
  CheckboxGroupAction,
  ColorSwatchPickerAction,
  RadioGroupAction,
  SelectAction
} from '../../../ui-model/choice-controls.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type { InlineContent } from '../../../visual/inline-content.ts';
import type { SelectPresentation } from '../../../behavior/choice-controls.ts';
import type { TextInputAction } from '../../../ui-model/text-input.ts';

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
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly message?: TMessage;
  readonly state?: ButtonState;
  readonly disabled?: boolean;
  readonly tone?: ButtonTone;
}

export interface CheckboxRenderProps<TMessage> {
  readonly label: string;
  readonly checked: boolean;
  readonly toMessage?: (checked: boolean) => TMessage;
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
  readonly presentation: RangeSliderPresentation;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly toActionMessage?: (action: RangeSliderAction) => TMessage;
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

export interface CheckboxGroupRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: readonly string[];
  readonly focused?: string;
  readonly toActionMessage?: (action: CheckboxGroupAction) => TMessage;
}

export interface RadioGroupRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly selected?: string;
  readonly focused?: string;
  readonly toActionMessage?: (action: RadioGroupAction) => TMessage;
}

export interface SelectRenderProps<TMessage> extends ChoiceControlRenderProps {
  readonly presentation: SelectPresentation;
  readonly toActionMessage?: (action: SelectAction) => TMessage;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions: number;
}

export interface ColorSwatchPickerRenderProps<TMessage> {
  readonly label?: string;
  readonly options: readonly ColorSwatchPickerOption<unknown>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly columns?: number;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toActionMessage?: (action: ColorSwatchPickerAction) => TMessage;
}

export interface CalendarRenderProps<TMessage> {
  readonly label?: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly toMessage?: (day: CalendarDay) => TMessage;
  readonly toActionMessage?: (action: CalendarAction) => TMessage;
}

export interface TextInputRenderProps<TMessage> {
  readonly value: string;
  readonly cursor?: number;
  readonly selection?: TextSelection;
  readonly placeholder?: string;
  readonly message?: TMessage;
  readonly toActionMessage?: (action: TextInputAction) => TMessage;
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
