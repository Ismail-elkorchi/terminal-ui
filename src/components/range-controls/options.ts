import type {
  NumericRange,
  RangeSliderState,
  RangeSliderTransition,
} from '../../behavior/range-slider.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { SliderStylePart } from '../style-parts.ts';


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
  | DisabledSliderOptions<TMessage>;

export interface ActiveSliderOptions<TMessage extends ComponentMessage> extends SliderOptionsBase {
  readonly onTransition: (transition: import('../form-controls.ts').SliderTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledSliderOptions<TMessage extends ComponentMessage = never> = SliderOptionsBase & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveSliderOptions<TMessage>>;

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
  | DisabledRangeSliderOptions<TMessage>;

export interface ActiveRangeSliderOptions<TMessage extends ComponentMessage> extends RangeSliderOptionsBase {
  readonly onTransition: (transition: RangeSliderTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledRangeSliderOptions<TMessage extends ComponentMessage = never> = RangeSliderOptionsBase & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveRangeSliderOptions<TMessage>>;
