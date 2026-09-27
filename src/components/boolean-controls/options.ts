import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { CheckboxTransition, SwitchTransition } from '../form-controls.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { ChoiceStylePart, ToggleStylePart } from '../style-parts.ts';


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
  | DisabledCheckboxOptions<TMessage>;

export interface ActiveCheckboxOptions<TMessage extends ComponentMessage> extends CheckboxOptionsBase {
  readonly onTransition: (transition: CheckboxTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledCheckboxOptions<TMessage extends ComponentMessage = never> = CheckboxOptionsBase & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveCheckboxOptions<TMessage>>;

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
  | DisabledSwitchOptions<TMessage>;

export interface ActiveSwitchOptions<TMessage extends ComponentMessage> extends SwitchOptionsBase {
  readonly onTransition: (transition: SwitchTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledSwitchOptions<TMessage extends ComponentMessage = never> = SwitchOptionsBase & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveSwitchOptions<TMessage>>;
