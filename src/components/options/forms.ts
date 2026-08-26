import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentMessage, Element } from '../../component/index.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ChoiceItem } from '../../collection/item.ts';
import type {
  ButtonPressEvent,
  ButtonTone,
  CheckboxTransition,
  ColorSwatchPickerOption
} from '../form-controls.ts';
import type { SwitchTransition } from '../form-controls.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { ComponentDensity } from '../density.ts';
import type { NumberInputControlTransition, NumberInputView } from '../../behavior/number-input.ts';
import type { NumericRange } from '../../behavior/range-slider.ts';
import type { TextInputSubmitEvent, TextInputTransition, TextInputState } from '../../behavior/text-input.ts';
import type { CalendarView, CalendarControlTransition } from '../../behavior/calendar.ts';
import type { CollectionInteractionState } from '../../interaction/collection-interaction.ts';
import type {
  CheckboxGroupControlTransition,
  ColorSwatchPickerControlTransition,
  RadioGroupControlTransition,
} from '../../behavior/choice-controls.ts';
import type { RangeSliderTransition, RangeSliderState } from '../../behavior/range-slider.ts';
import type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxView,
  AutocompleteComboboxTransition,
  ComboboxCommitEvent,
  ComboboxControlTransition,
  ScrollableComboboxState,
  ComboboxTransition,
  UnscrolledComboboxState,
} from '../../behavior/combobox.ts';
import type { ElementMeta } from '../../element/metadata.ts';
import type {
  ButtonStylePart,
  CalendarStylePart,
  ChoiceStylePart,
  ComboboxStylePart,
  ColorSwatchPickerStylePart,
  FieldStylePart,
  LabelStylePart,
  NumberInputStylePart,
  SliderStylePart,
  TextEntryStylePart,
  ToggleStylePart
} from '../style-parts.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';

export interface FormOptions<
  TContent extends readonly Element<ComponentMessage>[] = readonly Element<ComponentMessage>[],
> extends LayoutFlowOptions {
  readonly id?: string;
  readonly title?: string;
  readonly slots: { readonly content: TContent };
  readonly onTransition?: never;
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
  TPressMessage extends ComponentMessage = never,
> = ButtonOptionsBase & ButtonName & (
  | {
      readonly disabled: true;
      readonly onPress?: never;
    }
  | {
      readonly disabled?: false;
      readonly onPress: (event: ButtonPressEvent) => MessageResolution<TPressMessage>;
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
  readonly onTransition: (transition: CheckboxTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCheckboxOptions = CheckboxOptionsBase & {
  readonly onTransition?: never;
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
  readonly onTransition: (transition: SwitchTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledSwitchOptions = SwitchOptionsBase & {
  readonly onTransition?: never;
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
  readonly onTransition: (transition: import('../../components/form-controls.ts').SliderTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledSliderOptions = SliderOptionsBase & {
  readonly onTransition?: never;
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
  readonly onTransition: (transition: RangeSliderTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledRangeSliderOptions = RangeSliderOptionsBase & {
  readonly onTransition?: never;
  readonly disabled: true;
};

interface CheckboxGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly state: CollectionInteractionState;
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
  readonly onTransition: (transition: CheckboxGroupControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCheckboxGroupOptions<TValue> = CheckboxGroupOptionsBase<TValue> & {
  readonly onTransition?: never;
  readonly disabled: true;
};

interface ColorSwatchPickerOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ColorSwatchPickerOption<TValue>[];
  readonly state: CollectionInteractionState;
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
  readonly onTransition: (transition: ColorSwatchPickerControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledColorSwatchPickerOptions<TValue> = ColorSwatchPickerOptionsBase<TValue> & {
  readonly onTransition?: never;
  readonly disabled: true;
};

interface CalendarOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly view: CalendarView;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CalendarStylePart, 'focused' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CalendarOptions<TMessage extends ComponentMessage = never> =
  | ActiveCalendarOptions<TMessage>
  | DisabledCalendarOptions;

export interface ActiveCalendarOptions<TMessage extends ComponentMessage> extends CalendarOptionsBase {
  readonly onTransition: (transition: CalendarControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledCalendarOptions = CalendarOptionsBase & {
  readonly onTransition?: never;
  readonly disabled: true;
};

interface RadioGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly state: CollectionInteractionState;
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
  readonly onTransition: (transition: RadioGroupControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: false;
}

export type DisabledRadioGroupOptions<TValue> = RadioGroupOptionsBase<TValue> & {
  readonly onTransition?: never;
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
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ComboboxStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: Pick<ElementMeta, 'focus' | 'layer'>;
}

interface ActiveComboboxCallbacks<TTransition, TMessage extends ComponentMessage> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onCommit?: (event: ComboboxCommitEvent) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  readonly disabled?: false;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: false;
}

type UnscrolledComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly state: UnscrolledComboboxState;
  readonly scrollbar?: never;
};

type ScrollableComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly state: ScrollableComboboxState;
  readonly scrollbar?: ScrollbarOptions;
};

export type ActiveComboboxOptions<TValue, TMessage extends ComponentMessage> =
  | UnscrolledComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | ScrollableComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxTransition, TMessage>;

interface InertComboboxAvailability {
  readonly onTransition?: never;
  readonly onCommit?: never;
  readonly onContextMenu?: never;
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
  readonly onContextMenu?: never;
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
}

export type DisabledComboboxOptions<TValue> =
  | UnscrolledComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
  | ScrollableComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    };

export type UnscrolledComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = UnscrolledComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | InertComboboxAvailability
  | DisabledComboboxAvailability & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
);

export type ScrollableComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ScrollableComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxTransition, TMessage>
  | InertComboboxAvailability
  | DisabledComboboxAvailability & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    }
);

export type ComboboxOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | UnscrolledComboboxOptions<TValue, TMessage>
  | ScrollableComboboxOptions<TValue, TMessage>;

type UnscrolledAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll?: never }>;
  readonly scrollbar?: never;
};

type ScrollableAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>;
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
      readonly view: Extract<AutocompleteComboboxView, { readonly scroll?: never }>
        & { readonly open: false };
    }
  | ScrollableAutocompleteComboboxBase<TValue> & DisabledComboboxAvailability & {
      readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>
        & { readonly open: false };
    };

export type AnyComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ComboboxOptions<TValue, TMessage> | AutocompleteComboboxOptions<TValue, TMessage>;

interface TextInputOptionsBase {
  readonly id: string;
  readonly state: TextInputState;
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
  readonly onTransition: (transition: TextInputTransition) => MessageResolution<TMessage>;
  readonly onSubmit?: (event: TextInputSubmitEvent) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
};

export type DisabledTextInputOptions = TextInputOptionsBase & {
  readonly onTransition?: never;
  readonly onSubmit?: never;
  readonly onContextMenu?: never;
  readonly disabled: true;
  readonly readOnly?: never;
};

export type PasswordInputOptions<TMessage extends ComponentMessage = never> =
  (ActiveTextInputOptions<TMessage> | DisabledTextInputOptions) & { readonly mask?: string };

interface NumberInputOptionsBase {
  readonly id: string;
  readonly view: NumberInputView;
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
  readonly onTransition: (transition: NumberInputControlTransition) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  readonly disabled?: false;
  readonly readOnly?: boolean;
}

export type DisabledNumberInputOptions = NumberInputOptionsBase & {
  readonly onTransition?: never;
  readonly onContextMenu?: never;
  readonly disabled: true;
  readonly readOnly?: never;
};

export type {
  ButtonPressEvent,
  ButtonTone,
  CheckboxTransition,
  ColorSwatchPickerOption,
  SliderTransition,
  SwitchTransition
} from '../form-controls.ts';
export type {
  NumericRange,
  RangeSliderState,
  RangeSliderStepDirection,
  RangeSliderValue,
} from '../../behavior/range-slider.ts';
export type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxView,
  AutocompleteComboboxTransition,
  ComboboxCommitEvent,
  ComboboxState,
  ComboboxTransition,
} from '../../behavior/combobox.ts';
