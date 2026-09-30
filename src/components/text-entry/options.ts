import type { ControlKeymap } from '../../interaction/control-keymap.ts';
import type { TextInputKeyAction } from '../keymaps.ts';
import type { NumberInputControlTransition, NumberInputView } from '../../behavior/number-input.ts';
import type { TextInputSubmitEvent, TextInputTransition } from '../../behavior/text-input.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { TextEditBuffer } from '../../text/types.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { NumberInputStylePart, TextEntryStylePart } from '../style-parts.ts';


interface TextInputOptionsBase {
  readonly keymap?: ControlKeymap<TextInputKeyAction>;
  readonly id: string;
  readonly state: TextEditBuffer;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly readOnly?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextEntryStylePart, 'focused' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type TextInputOptions<TMessage extends ComponentMessage = never> =
  | ActiveTextInputOptions<TMessage>
  | DisabledTextInputOptions<TMessage>;

export type ActiveTextInputOptions<TMessage extends ComponentMessage> = TextInputOptionsBase & {
  readonly disabled?: boolean;
  readonly onTransition: (transition: TextInputTransition) => MessageResolution<TMessage>;
  readonly onSubmit?: (event: TextInputSubmitEvent) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
};

export type DisabledTextInputOptions<TMessage extends ComponentMessage = never> = TextInputOptionsBase & {
  readonly disabled: true;
  readonly readOnly?: never;
} & RetainedCallbacks<ActiveTextInputOptions<TMessage>>;

export type PasswordInputOptions<TMessage extends ComponentMessage = never> =
  (ActiveTextInputOptions<TMessage> | DisabledTextInputOptions<TMessage>) & { readonly mask?: string };

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
  | DisabledNumberInputOptions<TMessage>;

export interface ActiveNumberInputOptions<TMessage extends ComponentMessage> extends NumberInputOptionsBase {
  readonly onTransition: (transition: NumberInputControlTransition) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
}

export type DisabledNumberInputOptions<TMessage extends ComponentMessage = never> = NumberInputOptionsBase & {
  readonly disabled: true;
  readonly readOnly?: never;
} & RetainedCallbacks<ActiveNumberInputOptions<TMessage>>;
