import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage, Element } from '../../component/index.ts';
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
import type { SwitchAction } from '../../ui-model/forms.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type { NumberInputControlAction, NumberInputPresentation } from '../../ui-model/number-input.ts';
import type { TextInputAction, TextInputPresentation } from '../../ui-model/text-input.ts';
import type { CalendarPresentation, CalendarTransition } from '../../ui-model/calendar.ts';
import type { CollectionInteractionState } from '../../interaction/collection.ts';
import type {
  CheckboxGroupTransition,
  ColorSwatchPickerTransition,
  RadioGroupTransition,
} from '../../ui-model/choice-controls.ts';
import type { RangeSliderAction, RangeSliderState } from '../../ui-model/range-slider.ts';
import type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxPresentation,
  AutocompleteComboboxTransition,
  ComboboxCommitEvent,
  ComboboxControlTransition,
  ScrollableComboboxPresentation,
  ComboboxTransition,
  UnscrolledComboboxPresentation,
} from '../../ui-model/combobox.ts';
import type { ElementMeta } from '../../element/metadata.ts';
import type {
  ButtonStylePart,
  CalendarStylePart,
  ChoiceStylePart,
  ColorSwatchPickerStylePart,
  FieldStylePart,
  LabelStylePart,
  NumberInputStylePart,
  SliderStylePart,
  TextEntryStylePart,
  ToggleStylePart
} from '../../ui-model/style-parts.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';

export interface FormOptions<
  TContent extends readonly Element<ComponentMessage>[] = readonly Element<ComponentMessage>[],
> extends LayoutFlowOptions {
  readonly id?: string;
  readonly title?: string;
  readonly slots: { readonly content: TContent };
  readonly onAction?: never;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<'title'>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface FieldOptions<
  TChild extends import('../../element/index.ts').Element<ComponentMessage>
> extends LayoutFlowOptions {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly control: TChild;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<FieldStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface LabelOptions {
  readonly id: string;
  readonly text: string;
  readonly forId: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<LabelStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

interface ButtonOptionsBase {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ButtonStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type ButtonName =
  | { readonly label: string; readonly accessibleName?: string }
  | { readonly label?: never; readonly accessibleName: string };

export type ButtonOptions<
  TActionMessage extends ComponentMessage = never,
> = ButtonOptionsBase & ButtonName & (
  | {
      readonly disabled: true;
      readonly onAction?: never;
    }
  | {
      readonly disabled?: false;
      readonly onAction: (action: ButtonAction) => MessageResolution<TActionMessage>;
    }
);

interface CheckboxOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChoiceStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
};

interface SwitchOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ToggleStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type SwitchOptions<TMessage extends ComponentMessage = never> =
  | ActiveSwitchOptions<TMessage>
  | DisabledSwitchOptions;

export interface ActiveSwitchOptions<TMessage extends ComponentMessage> extends SwitchOptionsBase {
  readonly onAction: (action: SwitchAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledSwitchOptions = SwitchOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
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
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SliderStylePart, 'focused' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
};

interface RangeSliderOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly state: RangeSliderState;
  readonly range?: NumericRange;
  readonly step?: number;
  readonly width?: number;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SliderStylePart, 'focused' | 'active' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
};

interface CheckboxGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly presentation: CollectionInteractionState;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChoiceStylePart, 'focused' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CheckboxGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveCheckboxGroupOptions<TValue, TMessage>
  | DisabledCheckboxGroupOptions<TValue>;

export interface ActiveCheckboxGroupOptions<TValue, TMessage extends ComponentMessage>
  extends CheckboxGroupOptionsBase<TValue> {
  readonly onAction: (action: CheckboxGroupTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCheckboxGroupOptions<TValue> = CheckboxGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
};

interface ColorSwatchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ColorSwatchPickerOption<TValue>[];
  readonly presentation: CollectionInteractionState;
  readonly columns?: number;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ColorSwatchPickerStylePart, 'focused' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type ColorSwatchPickerOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveColorSwatchPickerOptions<TValue, TMessage>
  | DisabledColorSwatchPickerOptions<TValue>;

export interface ActiveColorSwatchPickerOptions<TValue, TMessage extends ComponentMessage>
  extends ColorSwatchPickerOptionsBase<TValue> {
  readonly onAction: (action: ColorSwatchPickerTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledColorSwatchPickerOptions<TValue> = ColorSwatchPickerOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
};

interface CalendarOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly presentation: CalendarPresentation;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CalendarStylePart, 'focused' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CalendarOptions<TMessage extends ComponentMessage = never> =
  | ActiveCalendarOptions<TMessage>
  | DisabledCalendarOptions;

export interface ActiveCalendarOptions<TMessage extends ComponentMessage> extends CalendarOptionsBase {
  readonly onAction: (action: CalendarTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCalendarOptions = CalendarOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
};

interface RadioGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly presentation: CollectionInteractionState;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChoiceStylePart, 'focused' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type RadioGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveRadioGroupOptions<TValue, TMessage>
  | DisabledRadioGroupOptions<TValue>;

export interface ActiveRadioGroupOptions<TValue, TMessage extends ComponentMessage>
  extends RadioGroupOptionsBase<TValue> {
  readonly onAction: (action: RadioGroupTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledRadioGroupOptions<TValue> = RadioGroupOptionsBase<TValue> & {
  readonly onAction?: never;
  readonly disabled: true;
};

interface ComboboxOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ChoiceStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: Pick<ElementMeta, 'focus' | 'layer'>;
}

interface ActiveComboboxCallbacks<TTransition, TMessage extends ComponentMessage> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onCommit?: (event: ComboboxCommitEvent) => MessageResolution<TMessage>;
  readonly disabled?: false;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: false;
}

type UnscrolledComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly presentation: UnscrolledComboboxPresentation;
  readonly scrollbar?: never;
};

type ScrollableComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly presentation: ScrollableComboboxPresentation;
  readonly scrollbar?: ScrollbarOptions;
};

export type ActiveComboboxOptions<TValue, TMessage extends ComponentMessage> =
  | UnscrolledComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | ScrollableComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxTransition, TMessage>;

interface InertComboboxAvailability {
  readonly onTransition?: never;
  readonly onCommit?: never;
  readonly disabled?: false;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
}

export type InertComboboxOptions<TValue> =
  | UnscrolledComboboxBase<TValue> & InertComboboxAvailability
  | ScrollableComboboxBase<TValue> & InertComboboxAvailability;

interface DisabledComboboxAvailability {
  readonly onTransition?: never;
  readonly onCommit?: never;
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
}

export type DisabledComboboxOptions<TValue> =
  | UnscrolledComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly presentation: UnscrolledComboboxPresentation & { readonly open: false };
    }
  | ScrollableComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly presentation: ScrollableComboboxPresentation & { readonly open: false };
    };

export type UnscrolledComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = UnscrolledComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | InertComboboxAvailability
  | DisabledComboboxAvailability & {
      readonly presentation: UnscrolledComboboxPresentation & { readonly open: false };
    }
);

export type ScrollableComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ScrollableComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxTransition, TMessage>
  | InertComboboxAvailability
  | DisabledComboboxAvailability & {
      readonly presentation: ScrollableComboboxPresentation & { readonly open: false };
    }
);

export type ComboboxOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | UnscrolledComboboxOptions<TValue, TMessage>
  | ScrollableComboboxOptions<TValue, TMessage>;

type UnscrolledAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly presentation: Extract<AutocompleteComboboxPresentation, { readonly scroll?: never }>;
  readonly scrollbar?: never;
};

type ScrollableAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly presentation: Extract<AutocompleteComboboxPresentation, { readonly scroll: unknown }>;
  readonly scrollbar?: ScrollbarOptions;
};

export type ActiveAutocompleteComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
> =
  | UnscrolledAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxControlTransition, TMessage>
  | ScrollableAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxTransition, TMessage>;

export type AutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> =
  | ActiveAutocompleteComboboxOptions<TValue, TMessage>
  | UnscrolledAutocompleteComboboxBase<TValue> & InertComboboxAvailability
  | ScrollableAutocompleteComboboxBase<TValue> & InertComboboxAvailability
  | UnscrolledAutocompleteComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly presentation: Extract<AutocompleteComboboxPresentation, { readonly scroll?: never }>
        & { readonly open: false };
    }
  | ScrollableAutocompleteComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly presentation: Extract<AutocompleteComboboxPresentation, { readonly scroll: unknown }>
        & { readonly open: false };
    };

export type AnyComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ComboboxOptions<TValue, TMessage> | AutocompleteComboboxOptions<TValue, TMessage>;

interface TextInputOptionsBase {
  readonly id: string;
  readonly presentation: TextInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly readOnly?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextEntryStylePart, 'focused' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
  readonly readOnly?: never;
};

export type PasswordInputOptions<TMessage extends ComponentMessage = never> =
  (ActiveTextInputOptions<TMessage> | DisabledTextInputOptions) & { readonly mask?: string };

interface NumberInputOptionsBase {
  readonly id: string;
  readonly presentation: NumberInputPresentation;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<NumberInputStylePart, 'focused' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type NumberInputOptions<TMessage extends ComponentMessage = never> =
  | ActiveNumberInputOptions<TMessage>
  | DisabledNumberInputOptions;

export interface ActiveNumberInputOptions<TMessage extends ComponentMessage> extends NumberInputOptionsBase {
  readonly onAction: (action: NumberInputControlAction) => MessageResolution<TMessage>;
  readonly disabled?: false;
  readonly readOnly?: boolean;
}

export type DisabledNumberInputOptions = NumberInputOptionsBase & {
  readonly onAction?: never;
  readonly disabled: true;
  readonly readOnly?: never;
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
  SwitchAction
} from '../../ui-model/forms.ts';
export type { RangeSliderState } from '../../ui-model/range-slider.ts';
export type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxPresentation,
  AutocompleteComboboxTransition,
  ComboboxCommitEvent,
  ComboboxPresentation,
  ComboboxTransition,
} from '../../ui-model/combobox.ts';
