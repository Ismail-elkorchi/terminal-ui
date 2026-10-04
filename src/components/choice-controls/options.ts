import type {
  CheckboxGroupControlTransition,
  ColorSwatchPickerControlTransition,
  RadioGroupControlTransition,
} from '../../behavior/choice-controls.ts';
import type { ChoiceItem } from '../../collection/item.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { CollectionInteractionState } from '../../interaction/collection-interaction.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ColorSwatchPickerOption } from '../form-controls.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { ChoiceStylePart, ColorSwatchPickerStylePart } from '../style-parts.ts';


interface CheckboxGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  /** Whether the visible label row is painted; the accessible label is always retained. */
  readonly labelVisibility?: 'visible' | 'hidden';
  readonly options: readonly ChoiceItem<TValue>[];
  readonly state: CollectionInteractionState;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChoiceStylePart, 'focused' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CheckboxGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveCheckboxGroupOptions<TValue, TMessage>
  | DisabledCheckboxGroupOptions<TValue, TMessage>;

export interface ActiveCheckboxGroupOptions<TValue, TMessage extends ComponentMessage>
  extends CheckboxGroupOptionsBase<TValue> {
  readonly onTransition: (transition: CheckboxGroupControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledCheckboxGroupOptions<TValue, TMessage extends ComponentMessage = never> = CheckboxGroupOptionsBase<TValue> & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveCheckboxGroupOptions<TValue, TMessage>>;

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
  | DisabledColorSwatchPickerOptions<TValue, TMessage>;

export interface ActiveColorSwatchPickerOptions<TValue, TMessage extends ComponentMessage>
  extends ColorSwatchPickerOptionsBase<TValue> {
  readonly onTransition: (transition: ColorSwatchPickerControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledColorSwatchPickerOptions<TValue, TMessage extends ComponentMessage = never> = ColorSwatchPickerOptionsBase<TValue> & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveColorSwatchPickerOptions<TValue, TMessage>>;

interface RadioGroupOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  /** Whether the visible label row is painted; the accessible label is always retained. */
  readonly labelVisibility?: 'visible' | 'hidden';
  readonly options: readonly ChoiceItem<TValue>[];
  readonly state: CollectionInteractionState;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChoiceStylePart, 'focused' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type RadioGroupOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | ActiveRadioGroupOptions<TValue, TMessage>
  | DisabledRadioGroupOptions<TValue, TMessage>;

export interface ActiveRadioGroupOptions<TValue, TMessage extends ComponentMessage>
  extends RadioGroupOptionsBase<TValue> {
  readonly onTransition: (transition: RadioGroupControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledRadioGroupOptions<TValue, TMessage extends ComponentMessage = never> = RadioGroupOptionsBase<TValue> & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveRadioGroupOptions<TValue, TMessage>>;
