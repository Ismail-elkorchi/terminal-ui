import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type {
  ButtonAction,
  ButtonTone,
  CheckboxAction,
  ColorSwatchPickerOption,
  NumericRange
} from '../../ui-model/forms.ts';
import type { ToggleSwitchAction } from '../../ui-model/forms.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { MessageResolution } from '../../interaction/message.ts';
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
import type { ElementMeta, ElementOptions } from '../../element/metadata.ts';
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
import type { ComponentMetadataOptions } from '../../component/index.ts';

export interface FormOptions extends LayoutFlowOptions {
  readonly title?: string;
}

export interface FieldOptions<
  TChild extends import('../../element/index.ts').Element<ComponentMessage>
> extends LayoutFlowOptions {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly slots: { readonly content: readonly TChild[] };
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], FormGroupStylePart>;
}

export interface LabelOptions {
  readonly id: string;
  readonly text: string;
  readonly forId: string;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], FormGroupStylePart>;
}

interface ButtonOptionsBase extends ElementOptions<ButtonStylePart> {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly pointerState?: PointerInteractionState;
}

export type ButtonOptions<TMessage extends ComponentMessage = never> = ButtonOptionsBase & (
  | {
      readonly disabled: true;
      readonly onAction?: never;
    }
  | {
      readonly disabled?: false;
      readonly onAction: (action: ButtonAction) => MessageResolution<TMessage>;
    }
);

interface CheckboxOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChoiceStylePart>;
}

export type CheckboxOptions<TMessage extends ComponentMessage = never> =
  | ActiveCheckboxOptions<TMessage>
  | DisabledCheckboxOptions;

export interface ActiveCheckboxOptions<TMessage extends ComponentMessage> extends CheckboxOptionsBase {
  readonly onAction: (action: CheckboxAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCheckboxOptions = CheckboxOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface ToggleSwitchOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ToggleStylePart>;
}

export type ToggleSwitchOptions<TMessage extends ComponentMessage = never> =
  | ActiveToggleSwitchOptions<TMessage>
  | DisabledToggleSwitchOptions;

export interface ActiveToggleSwitchOptions<TMessage extends ComponentMessage> extends ToggleSwitchOptionsBase {
  readonly onAction: (action: ToggleSwitchAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledToggleSwitchOptions = ToggleSwitchOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface SliderOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly width?: number;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], SliderStylePart>;
}

export type SliderOptions<TMessage extends ComponentMessage = never> =
  | ActiveSliderOptions<TMessage>
  | DisabledSliderOptions;

export interface ActiveSliderOptions<TMessage extends ComponentMessage> extends SliderOptionsBase {
  readonly onAction: (action: import('../../ui-model/forms.ts').SliderAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledSliderOptions = SliderOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface RangeSliderOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly state: RangeSliderState;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], SliderStylePart>;
}

export type RangeSliderOptions<TMessage extends ComponentMessage = never> =
  | ActiveRangeSliderOptions<TMessage>
  | DisabledRangeSliderOptions;

export interface ActiveRangeSliderOptions<TMessage extends ComponentMessage> extends RangeSliderOptionsBase {
  readonly onAction: (action: RangeSliderAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledRangeSliderOptions = RangeSliderOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface CheckboxGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: readonly string[];
  readonly focused?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChoiceStylePart>;
}

export type CheckboxGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveCheckboxGroupOptions<TValue, TMessage>
  | DisabledCheckboxGroupOptions<TValue>;

export interface ActiveCheckboxGroupOptions<TValue, TMessage extends ComponentMessage>
  extends CheckboxGroupOptionsBase<TValue> {
  readonly onAction: (action: CheckboxGroupAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCheckboxGroupOptions<TValue> = CheckboxGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface ColorSwatchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ColorSwatchPickerOption<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly columns?: number;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], PickerStylePart>;
}

export type ColorSwatchPickerOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveColorSwatchPickerOptions<TValue, TMessage>
  | DisabledColorSwatchPickerOptions<TValue>;

export interface ActiveColorSwatchPickerOptions<TValue, TMessage extends ComponentMessage>
  extends ColorSwatchPickerOptionsBase<TValue> {
  readonly onAction: (action: ColorSwatchPickerAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledColorSwatchPickerOptions<TValue> = ColorSwatchPickerOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface CalendarOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly monthLabel: string;
  readonly weekdays: readonly string[];
  readonly days: readonly CalendarDay[];
  readonly selected?: string;
  readonly focused?: string;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], PickerStylePart>;
}

export type CalendarOptions<TMessage extends ComponentMessage = never> =
  | ActiveCalendarOptions<TMessage>
  | DisabledCalendarOptions;

export interface ActiveCalendarOptions<TMessage extends ComponentMessage> extends CalendarOptionsBase {
  readonly onAction: (action: CalendarAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCalendarOptions = CalendarOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface RadioGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly selected?: string;
  readonly focused?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChoiceStylePart>;
}

export type RadioGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveRadioGroupOptions<TValue, TMessage>
  | DisabledRadioGroupOptions<TValue>;

export interface ActiveRadioGroupOptions<TValue, TMessage extends ComponentMessage>
  extends RadioGroupOptionsBase<TValue> {
  readonly onAction: (action: RadioGroupAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledRadioGroupOptions<TValue> = RadioGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

interface SelectOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: Pick<ElementMeta<ChoiceStylePart>, 'focus' | 'layer' | 'styles'>;
}

export type SelectOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveSelectOptions<TValue, TMessage>
  | DisabledSelectOptions<TValue>;

export interface ActiveSelectOptions<TValue, TMessage extends ComponentMessage>
  extends SelectOptionsBase<TValue> {
  readonly presentation: SelectPresentation;
  readonly onAction: (action: SelectAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledSelectOptions<TValue> = SelectOptionsBase<TValue> & {
  readonly presentation: Extract<SelectPresentation, { readonly kind: 'closed' }>;
  readonly onAction?: never;
  readonly disabled: true;
};

interface TextInputOptionsBase {
  readonly id: string;
  readonly presentation: TextInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], TextEntryStylePart>;
}

export type TextInputOptions<TMessage extends ComponentMessage = never> =
  | ActiveTextInputOptions<TMessage>
  | DisabledTextInputOptions;

export type ActiveTextInputOptions<TMessage extends ComponentMessage> = TextInputOptionsBase & {
  readonly disabled?: false;
  readonly onAction: (action: TextInputAction) => MessageResolution<TMessage>;
};

export type DisabledTextInputOptions = TextInputOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

export type PasswordInputOptions<TMessage extends ComponentMessage = never> =
  (ActiveTextInputOptions<TMessage> | DisabledTextInputOptions) & { readonly mask?: string };

interface NumberInputOptionsBase {
  readonly id: string;
  readonly presentation: NumberInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], NumberInputStylePart>;
}

export type NumberInputOptions<TMessage extends ComponentMessage = never> =
  | ActiveNumberInputOptions<TMessage>
  | DisabledNumberInputOptions;

export interface ActiveNumberInputOptions<TMessage extends ComponentMessage> extends NumberInputOptionsBase {
  readonly onAction: (action: NumberInputControlAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledNumberInputOptions = NumberInputOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly pointerState?: never;
};

export type {
  ButtonAction,
  ButtonTone,
  CheckboxAction,
  ColorSwatchPickerOption,
  NumericRange,
  RangeSliderValue,
  SliderAction,
  SliderStepDirection,
  ToggleSwitchAction
} from '../../ui-model/forms.ts';
export type { RangeSliderState } from '../../ui-model/range-slider.ts';
export type { SelectPresentation } from '../../ui-model/choice-controls.ts';
